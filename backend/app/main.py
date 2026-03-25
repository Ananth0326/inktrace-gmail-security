from datetime import datetime, timezone
import threading
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, engine, get_db, SessionLocal
from app.models import EmailRecord, User
from app.services.ai_service import classify_email
from app.services.auth_service import (
    build_google_auth_url,
    create_session,
    destroy_session,
    exchange_code_for_tokens,
    get_session_user_id,
    load_token_json,
    parse_user_info,
    token_json,
    validate_state,
)
from app.services.gmail_service import iter_messages

app_settings = get_settings()

api_application = FastAPI(title="Email Scanner API")

# Allow the frontend application to talk to this backend
api_application.add_middleware(
    CORSMiddleware,
    allow_origins=[
        app_settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
)

# Create the database tables if they do not exist
Base.metadata.create_all(bind=engine)

# Keep track of background email scanning jobs
BACKGROUND_SYNC_JOBS_DICTIONARY: dict[int, dict] = {}
BACKGROUND_SYNC_LOCK = threading.Lock()


def set_sync_job_state(user_id_number: int, **status_updates):
    """
    Safely updates the status of a user's background email scan.
    We use a lock to prevent different threads from corrupting the data at the same time.
    """
    with BACKGROUND_SYNC_LOCK:
        current_job_status = BACKGROUND_SYNC_JOBS_DICTIONARY.get(user_id_number, {})
        current_job_status.update(status_updates)
        BACKGROUND_SYNC_JOBS_DICTIONARY[user_id_number] = current_job_status


def get_sync_job_state(user_id_number: int) -> dict:
    """
    Safely reads the current status of a user's background email scan.
    """
    with BACKGROUND_SYNC_LOCK:
        default_status = {"status": "idle", "saved": 0, "processed": 0, "error": None}
        return BACKGROUND_SYNC_JOBS_DICTIONARY.get(user_id_number, default_status)


def run_background_sync_job(user_id_number: int, maximum_results_to_fetch: int, emails_per_page: int) -> None:
    """
    This function runs in the background. It downloads emails from Gmail, 
    classifies them using our AI service, and saves them to the database.
    """
    database_session = SessionLocal()
    try:
        user_record = database_session.query(User).filter(User.id == user_id_number).first()
        if not user_record:
            set_sync_job_state(user_id_number, status="failed", error="User not found in database")
            return

        set_sync_job_state(
            user_id_number,
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
            saved=0,
            processed=0,
            error=None,
        )

        # Remove old emails before pulling new ones to keep the database clean
        database_session.query(EmailRecord).filter(EmailRecord.user_id == user_id_number).delete()
        database_session.commit()

        google_tokens_dictionary = load_token_json(user_record.token_json)
        emails_processed_count = 0
        emails_saved_count = 0

        # Loop through emails fetched from Gmail
        for email_message in iter_messages(tokens=google_tokens_dictionary, max_results=maximum_results_to_fetch, page_size=emails_per_page):
            
            # Send the email to our AI service to decide if it is safe, suspicious, or phishing
            classification_result = classify_email(
                subject=email_message["subject"],
                sender=email_message["sender"],
                snippet=email_message["snippet"],
                body_text=email_message["body_text"],
            )
            
            new_email_record = EmailRecord(
                user_id=user_id_number,
                gmail_message_id=email_message["gmail_message_id"],
                sender=email_message["sender"],
                subject=email_message["subject"],
                snippet=email_message["snippet"],
                body_text=email_message["body_text"],
                label=classification_result["label"],
                confidence=classification_result["confidence"],
                reason=classification_result["reason"],
            )
            
            database_session.add(new_email_record)
            emails_processed_count = emails_processed_count + 1
            emails_saved_count = emails_saved_count + 1

            # Save to the database every 12 emails so the user can see progress visually immediately
            if emails_processed_count % 12 == 0:
                database_session.commit()
                set_sync_job_state(user_id_number, status="running", saved=emails_saved_count, processed=emails_processed_count)

        # Final save for any remaining emails
        database_session.commit()
        set_sync_job_state(
            user_id_number,
            status="completed",
            saved=emails_saved_count,
            processed=emails_processed_count,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        
    except Exception as general_error:
        database_session.rollback()
        set_sync_job_state(user_id_number, status="failed", error=str(general_error))
    finally:
        database_session.close()


def get_current_logged_in_user(
    authorization: str | None = Header(default=None),
    database_session: Session = Depends(get_db),
) -> User:
    """
    A helper function that checks the user's session token and finds them in the database.
    If they are not logged in, it throws an error that the frontend will catch.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="You are missing a valid session token.")

    session_token_string = authorization.split(" ", 1)[1].strip()
    user_id_number = get_session_user_id(session_token_string)
    
    if not user_id_number:
        raise HTTPException(status_code=401, detail="Your session is invalid or has expired.")

    user_record = database_session.query(User).filter(User.id == user_id_number).first()
    
    if not user_record:
        raise HTTPException(status_code=401, detail="We could not find your user account.")
        
    return user_record


@api_application.get("/health")
def health_check():
    """Simple endpoint to check if the server is running happily."""
    return {"server_is_healthy": True}


def is_allowed_to_redirect_to_frontend(url_candidate_string: str | None) -> bool:
    """Checks if a URL is safe to redirect the user to after they log in to prevent security issues."""
    if not url_candidate_string:
        return False
        
    cleaned_url_string = url_candidate_string.strip()
    if not cleaned_url_string:
        return False
        
    if cleaned_url_string == app_settings.frontend_url:
        return True
        
    if cleaned_url_string.startswith("http://localhost:") or cleaned_url_string.startswith("http://127.0.0.1:"):
        return True
        
    return False


def create_frontend_redirect_url(frontend_base_url: str, session_token_string: str | None = None, authentication_error_message: str | None = None) -> str:
    """Builds the URL to send the user back to the frontend application."""
    cleaned_base_string = frontend_base_url.rstrip("/")
    
    if authentication_error_message:
        return f"{cleaned_base_string}/?auth_error={quote(authentication_error_message)}"
        
    if session_token_string:
        return f"{cleaned_base_string}/?session={quote(session_token_string)}"
        
    return f"{cleaned_base_string}/"


@api_application.get("/auth/google/login")
def start_google_login(redirect_to: str | None = Query(default=None)):
    """Generates the special Google login link and gives it to the frontend."""
    frontend_target_url_string = app_settings.frontend_url
    if is_allowed_to_redirect_to_frontend(redirect_to):
        frontend_target_url_string = redirect_to
        
    google_authorization_url_string = build_google_auth_url(redirect_to=frontend_target_url_string)
    
    return {"auth_url": google_authorization_url_string}


@api_application.get("/auth/google/callback")
def finish_google_login_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    database_session: Session = Depends(get_db),
):
    """Google sends the user here after they log in successfully, or if there is an error."""
    frontend_target_url_string = app_settings.frontend_url
    
    if error:
        error_message_string = error_description or error
        redirect_url = create_frontend_redirect_url(frontend_target_url_string, authentication_error_message=error_message_string)
        return RedirectResponse(url=redirect_url)

    if not code or not state:
        redirect_url = create_frontend_redirect_url(frontend_target_url_string, authentication_error_message="Missing authentication code from Google.")
        return RedirectResponse(url=redirect_url)

    state_payload_data = validate_state(state)
    if not state_payload_data:
        redirect_url = create_frontend_redirect_url(frontend_target_url_string, authentication_error_message="Invalid security state. Please try logging in again.")
        return RedirectResponse(url=redirect_url)
        
    redirect_target_from_state_string = state_payload_data.get("redirect_to")
    if isinstance(redirect_target_from_state_string, str) and is_allowed_to_redirect_to_frontend(redirect_target_from_state_string):
        frontend_target_url_string = redirect_target_from_state_string

    try:
        google_tokens_dictionary = exchange_code_for_tokens(code)
        user_information_dictionary = parse_user_info(google_tokens_dictionary["id_token"])
    except Exception as token_exchange_error:
        error_message = f"Could not get tokens: {str(token_exchange_error)}"
        redirect_url = create_frontend_redirect_url(frontend_target_url_string, authentication_error_message=error_message)
        return RedirectResponse(url=redirect_url)

    tokens_to_store_in_database = {
        **google_tokens_dictionary,
        "client_id": app_settings.google_client_id,
        "client_secret": app_settings.google_client_secret,
    }

    user_email_string = user_information_dictionary["email"]
    user_record = database_session.query(User).filter(User.email == user_email_string).first()
    
    if not user_record:
        # Create a new user if they don't exist
        user_record = User(
            email=user_information_dictionary["email"],
            name=user_information_dictionary.get("name", ""),
            token_json=token_json(tokens_to_store_in_database),
        )
        database_session.add(user_record)
    else:
        # Update existing user's information
        user_record.name = user_information_dictionary.get("name", user_record.name)
        user_record.token_json = token_json(tokens_to_store_in_database)

    database_session.commit()
    database_session.refresh(user_record)

    new_session_token_string = create_session(user_record.id)
    redirect_url = create_frontend_redirect_url(frontend_target_url_string, session_token_string=new_session_token_string)
    return RedirectResponse(url=redirect_url)


@api_application.post("/emails/sync")
def start_syncing_emails(
    max_results: int = Query(default=0, ge=0, le=20000),
    page_size: int = Query(default=200, ge=50, le=500),
    current_user: User = Depends(get_current_logged_in_user),
):
    """Starts the background process of fetching and analyzing emails."""
    current_sync_state = get_sync_job_state(current_user.id)
    
    if current_sync_state.get("status") == "running":
        # If it is already running, we just return the current status
        return {"okay": True, "already_running": True, **current_sync_state}

    background_worker_thread = threading.Thread(
        target=run_background_sync_job, 
        args=(current_user.id, max_results, page_size), 
        daemon=True
    )
    background_worker_thread.start()
    
    return {"okay": True, "status": "started_successfully"}


@api_application.get("/emails/sync/status")
def get_syncing_status(current_user: User = Depends(get_current_logged_in_user)):
    """Allows the frontend to check the progress of the background scan."""
    return get_sync_job_state(current_user.id)


@api_application.get("/emails")
def get_list_of_emails(
    limit: int = Query(default=120, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    label: str | None = Query(default=None),
    current_user: User = Depends(get_current_logged_in_user),
    database_session: Session = Depends(get_db),
):
    """Returns the emails that have been scanned and saved in the database."""
    base_database_query = database_session.query(EmailRecord).filter(EmailRecord.user_id == current_user.id)
    
    if label == "safe" or label == "suspicious" or label == "phishing":
        base_database_query = base_database_query.filter(EmailRecord.label == label)

    total_emails_count = base_database_query.count()
    email_rows_list = base_database_query.order_by(EmailRecord.scanned_at.desc()).offset(offset).limit(limit).all()
    
    list_of_formatted_emails = []
    for record in email_rows_list:
        formatted_email_dictionary = {
            "id": record.id,
            "sender": record.sender,
            "subject": record.subject,
            "snippet": record.snippet,
            "body_text": record.body_text,
            "label": record.label,
            "confidence": record.confidence,
            "reason": record.reason,
            "scanned_at": record.scanned_at,
        }
        list_of_formatted_emails.append(formatted_email_dictionary)
        
    return {
        "items": list_of_formatted_emails, 
        "total": total_emails_count, 
        "limit": limit, 
        "offset": offset
    }


@api_application.get("/emails/stats")
def get_overall_email_statistics(
    current_user: User = Depends(get_current_logged_in_user), 
    database_session: Session = Depends(get_db)
):
    """Counts how many safe, suspicious, and phishing emails the user has in total."""
    base_database_query = database_session.query(EmailRecord).filter(EmailRecord.user_id == current_user.id)
    
    total_count_number = base_database_query.count()
    safe_count_number = base_database_query.filter(EmailRecord.label == "safe").count()
    suspicious_count_number = base_database_query.filter(EmailRecord.label == "suspicious").count()
    phishing_count_number = base_database_query.filter(EmailRecord.label == "phishing").count()
    
    return {
        "total": total_count_number,
        "safe": safe_count_number,
        "suspicious": suspicious_count_number,
        "phishing": phishing_count_number,
    }


@api_application.get("/me")
def get_my_profile_information(current_user: User = Depends(get_current_logged_in_user)):
    """Returns basic profile information about the logged-in user."""
    return {
        "email": current_user.email, 
        "name": current_user.name or ""
    }


@api_application.patch("/emails/{email_id_number}/label")
def allow_user_to_change_email_label(
    email_id_number: int,
    label: str = Query(...),
    current_user: User = Depends(get_current_logged_in_user),
    database_session: Session = Depends(get_db),
):
    """Allows a user to manually correct an email's label and trains the AI from it instantly."""
    normalized_label_string = label.strip().lower()
    
    if normalized_label_string not in ["safe", "suspicious", "phishing"]:
        raise HTTPException(status_code=400, detail="Label must be one of: safe, suspicious, phishing")

    email_record = database_session.query(EmailRecord).filter(
        EmailRecord.user_id == current_user.id, 
        EmailRecord.id == email_id_number
    ).first()
    
    if not email_record:
        raise HTTPException(status_code=404, detail="Email record not found in the database.")

    email_record.label = normalized_label_string
    
    user_override_reason_text = f"User override label: {normalized_label_string}"
    
    if email_record.reason:
        email_record.reason = f"{email_record.reason} | {user_override_reason_text}"
    else:
        email_record.reason = user_override_reason_text
    
    # Active Learning: Teach the AI immediately using the user's manual correction
    from app.services.ai_service import learn_from_feedback
    learn_from_feedback(
        subject=email_record.subject or "",
        sender=email_record.sender or "",
        snippet=email_record.snippet or "",
        body_text=email_record.body_text or "",
        label=normalized_label_string
    )

    database_session.commit()
    database_session.refresh(email_record)
    
    return {
        "okay": True, 
        "id": email_record.id, 
        "label": email_record.label
    }


@api_application.post("/auth/logout")
def user_logout(
    authorization: str | None = Header(default=None),
    database_session: Session = Depends(get_db),
):
    """Logs the user out and heavily deletes their data for strict privacy."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="You are missing a valid session token.")

    session_token_string = authorization.split(" ", 1)[1].strip()
    user_id_number = get_session_user_id(session_token_string)
    
    if user_id_number:
        # Delete the user and all of their saved emails from the database
        user_record_to_delete = database_session.query(User).filter(User.id == user_id_number).first()
        if user_record_to_delete:
            database_session.delete(user_record_to_delete)
            database_session.commit()
            
        # Clean up any background tracking data dict entry for this user
        with BACKGROUND_SYNC_LOCK:
            BACKGROUND_SYNC_JOBS_DICTIONARY.pop(user_id_number, None)
            
    # Remove the session from our valid sessions list
    destroy_session(session_token_string)
    
    return {"okay": True, "message": "Successfully logged out and all personal data deleted."}

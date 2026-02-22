from datetime import datetime, timezone
from threading import Lock, Thread
from urllib.parse import quote

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
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

settings = get_settings()

app = FastAPI(title="Email Scanner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?$",
)

Base.metadata.create_all(bind=engine)
SYNC_JOBS: dict[int, dict] = {}
SYNC_LOCK = Lock()


def _set_sync_state(user_id: int, **updates):
    with SYNC_LOCK:
        current = SYNC_JOBS.get(user_id, {})
        current.update(updates)
        SYNC_JOBS[user_id] = current


def _get_sync_state(user_id: int) -> dict:
    with SYNC_LOCK:
        return SYNC_JOBS.get(user_id, {"status": "idle", "saved": 0, "processed": 0, "error": None})


def _run_sync_job(user_id: int, max_results: int, page_size: int) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            _set_sync_state(user_id, status="failed", error="User not found")
            return

        _set_sync_state(
            user_id,
            status="running",
            started_at=datetime.now(timezone.utc).isoformat(),
            saved=0,
            processed=0,
            error=None,
        )

        db.query(EmailRecord).filter(EmailRecord.user_id == user_id).delete()
        db.commit()

        tokens = load_token_json(user.token_json)
        processed = 0
        saved = 0

        for message in iter_messages(tokens=tokens, max_results=max_results, page_size=page_size):
            verdict = classify_email(
                subject=message["subject"],
                sender=message["sender"],
                snippet=message["snippet"],
                body_text=message["body_text"],
            )
            record = EmailRecord(
                user_id=user_id,
                gmail_message_id=message["gmail_message_id"],
                sender=message["sender"],
                subject=message["subject"],
                snippet=message["snippet"],
                body_text=message["body_text"],
                label=verdict["label"],
                confidence=verdict["confidence"],
                reason=verdict["reason"],
            )
            db.add(record)
            processed += 1
            saved += 1

            # Commit every few records so frontend can show incremental results immediately.
            if processed % 12 == 0:
                db.commit()
                _set_sync_state(user_id, status="running", saved=saved, processed=processed)

        db.commit()
        _set_sync_state(
            user_id,
            status="completed",
            saved=saved,
            processed=processed,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
    except Exception as exc:
        db.rollback()
        _set_sync_state(user_id, status="failed", error=str(exc))
    finally:
        db.close()


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing session token")

    token = authorization.split(" ", 1)[1].strip()
    user_id = get_session_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@app.get("/health")
def health():
    return {"ok": True}


def _is_allowed_frontend_redirect(value: str | None) -> bool:
    if not value:
        return False
    candidate = value.strip()
    if not candidate:
        return False
    if candidate == settings.frontend_url:
        return True
    return candidate.startswith("http://localhost:") or candidate.startswith("http://127.0.0.1:")


def _frontend_redirect_url(frontend_base: str, session_token: str | None = None, auth_error: str | None = None) -> str:
    base = frontend_base.rstrip("/")
    if auth_error:
        return f"{base}/?auth_error={quote(auth_error)}"
    if session_token:
        return f"{base}/?session={quote(session_token)}"
    return f"{base}/"


@app.get("/auth/google/login")
def auth_google_login(redirect_to: str | None = Query(default=None)):
    frontend_target = redirect_to if _is_allowed_frontend_redirect(redirect_to) else settings.frontend_url
    return {"auth_url": build_google_auth_url(redirect_to=frontend_target)}


@app.get("/auth/google/callback")
def auth_google_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    frontend_target = settings.frontend_url
    if error:
        msg = error_description or error
        return RedirectResponse(url=_frontend_redirect_url(frontend_target, auth_error=msg))

    if not code or not state:
        return RedirectResponse(url=_frontend_redirect_url(frontend_target, auth_error="Missing code or state from Google callback"))

    state_payload = validate_state(state)
    if not state_payload:
        return RedirectResponse(url=_frontend_redirect_url(frontend_target, auth_error="Invalid OAuth state. Retry sign in."))
    redirect_to = state_payload.get("redirect_to")
    if isinstance(redirect_to, str) and _is_allowed_frontend_redirect(redirect_to):
        frontend_target = redirect_to

    try:
        tokens = exchange_code_for_tokens(code)
        user_info = parse_user_info(tokens["id_token"])
    except Exception as exc:
        return RedirectResponse(url=_frontend_redirect_url(frontend_target, auth_error=f"Token exchange failed: {str(exc)}"))

    stored_tokens = {
        **tokens,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
    }

    user = db.query(User).filter(User.email == user_info["email"]).first()
    if not user:
        user = User(
            email=user_info["email"],
            name=user_info.get("name", ""),
            token_json=token_json(stored_tokens),
        )
        db.add(user)
    else:
        user.name = user_info.get("name", user.name)
        user.token_json = token_json(stored_tokens)

    db.commit()
    db.refresh(user)

    session_token = create_session(user.id)
    return RedirectResponse(url=_frontend_redirect_url(frontend_target, session_token=session_token))


@app.post("/emails/sync")
def sync_emails(
    max_results: int = Query(default=0, ge=0, le=20000),
    page_size: int = Query(default=200, ge=50, le=500),
    user: User = Depends(get_current_user),
):
    state = _get_sync_state(user.id)
    if state.get("status") == "running":
        return {"ok": True, "already_running": True, **state}

    worker = Thread(target=_run_sync_job, args=(user.id, max_results, page_size), daemon=True)
    worker.start()
    return {"ok": True, "status": "started"}


@app.get("/emails/sync/status")
def sync_status(user: User = Depends(get_current_user)):
    return _get_sync_state(user.id)


@app.get("/emails")
def list_emails(
    limit: int = Query(default=120, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    label: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base_q = db.query(EmailRecord).filter(EmailRecord.user_id == user.id)
    if label in {"safe", "suspicious", "phishing"}:
        base_q = base_q.filter(EmailRecord.label == label)

    total = base_q.count()
    rows = base_q.order_by(EmailRecord.scanned_at.desc()).offset(offset).limit(limit).all()
    items = [
        {
            "id": r.id,
            "sender": r.sender,
            "subject": r.subject,
            "snippet": r.snippet,
            "body_text": r.body_text,
            "label": r.label,
            "confidence": r.confidence,
            "reason": r.reason,
            "scanned_at": r.scanned_at,
        }
        for r in rows
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@app.get("/emails/stats")
def email_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    base_q = db.query(EmailRecord).filter(EmailRecord.user_id == user.id)
    total = base_q.count()
    safe = base_q.filter(EmailRecord.label == "safe").count()
    suspicious = base_q.filter(EmailRecord.label == "suspicious").count()
    phishing = base_q.filter(EmailRecord.label == "phishing").count()
    return {
        "total": total,
        "safe": safe,
        "suspicious": suspicious,
        "phishing": phishing,
    }


@app.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"email": user.email, "name": user.name or ""}


@app.patch("/emails/{email_id}/label")
def relabel_email(
    email_id: int,
    label: str = Query(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    normalized = label.strip().lower()
    if normalized not in {"safe", "suspicious", "phishing"}:
        raise HTTPException(status_code=400, detail="Label must be one of: safe, suspicious, phishing")

    row = (
        db.query(EmailRecord)
        .filter(EmailRecord.user_id == user.id, EmailRecord.id == email_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Email not found")

    row.label = normalized
    if row.reason:
        row.reason = f"{row.reason} | User override label: {normalized}"
    else:
        row.reason = f"User override label: {normalized}"
    
    # Active Learning: Teach the AI immediately
    from app.services.ai_service import learn_from_feedback
    learn_from_feedback(
        subject=row.subject or "",
        sender=row.sender or "",
        snippet=row.snippet or "",
        body_text=row.body_text or "",
        label=normalized
    )

    db.commit()
    db.refresh(row)
    return {"ok": True, "id": row.id, "label": row.label}


@app.post("/auth/logout")
def logout(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing session token")

    token = authorization.split(" ", 1)[1].strip()
    user_id = get_session_user_id(token)
    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            db.delete(user)
            db.commit()
        with SYNC_LOCK:
            SYNC_JOBS.pop(user_id, None)
    destroy_session(token)
    return {"ok": True, "message": "Logged out and user data deleted."}

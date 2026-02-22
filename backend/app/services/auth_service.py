import json
import secrets
import urllib.parse
import hashlib
import hmac
import base64
from datetime import datetime, timedelta, timezone

import requests
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.config import get_settings


settings = get_settings()

# Simple in-memory session store for MVP.
SESSIONS = {}
SESSION_TTL_HOURS = 12


SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def _encode_state_payload(payload_obj: dict) -> str:
    payload_json = json.dumps(payload_obj, separators=(",", ":"), ensure_ascii=True)
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("utf-8").rstrip("=")
    sig = hmac.new(
        settings.google_client_secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")
    return f"{payload_b64}.{sig_b64}"


def _decode_state_payload(state: str) -> dict | None:
    try:
        payload_b64, provided_sig = state.split(".", 1)
    except ValueError:
        return None

    expected_sig = hmac.new(
        settings.google_client_secret.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    encoded_expected = base64.urlsafe_b64encode(expected_sig).decode("utf-8").rstrip("=")
    if not hmac.compare_digest(provided_sig, encoded_expected):
        return None

    try:
        # Restore padding for b64 decode.
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload_json = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload = json.loads(payload_json)
    except Exception:
        return None

    ts = payload.get("ts")
    if not isinstance(ts, int):
        return None
    issued_at = datetime.fromtimestamp(ts, tz=timezone.utc)
    if (datetime.now(timezone.utc) - issued_at) >= timedelta(minutes=15):
        return None
    return payload


def build_google_auth_url(redirect_to: str | None = None) -> str:
    state_payload = {
        "ts": int(datetime.now(timezone.utc).timestamp()),
        "nonce": secrets.token_urlsafe(16),
    }
    if redirect_to:
        state_payload["redirect_to"] = redirect_to

    state = _encode_state_payload(state_payload)

    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"


def validate_state(state: str) -> dict | None:
    return _decode_state_payload(state)


def exchange_code_for_tokens(code: str) -> dict:
    resp = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.json()


def parse_user_info(id_token_value: str) -> dict:
    payload = id_token.verify_oauth2_token(
        id_token_value,
        google_requests.Request(),
        settings.google_client_id,
    )
    return {
        "email": payload.get("email"),
        "name": payload.get("name", ""),
    }


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = {
        "user_id": user_id,
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
    }
    return token


def get_session_user_id(session_token: str) -> int | None:
    session = SESSIONS.get(session_token)
    if not session:
        return None
    if session["expires_at"] < datetime.now(timezone.utc):
        SESSIONS.pop(session_token, None)
        return None
    return session["user_id"]


def destroy_session(session_token: str) -> None:
    SESSIONS.pop(session_token, None)


def token_json(tokens: dict) -> str:
    return json.dumps(tokens)


def load_token_json(raw: str) -> dict:
    return json.loads(raw)

import base64
import time
from typing import Any

from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build


def _decode_body(payload: dict[str, Any]) -> str:
    data = payload.get("body", {}).get("data")
    if data:
        return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="ignore")

    for part in payload.get("parts", []) or []:
        mime = part.get("mimeType", "")
        if mime in {"text/plain", "text/html"}:
            part_data = part.get("body", {}).get("data")
            if part_data:
                return base64.urlsafe_b64decode(part_data.encode("utf-8")).decode("utf-8", errors="ignore")
    return ""


def build_service(tokens: dict):
    creds = Credentials(
        token=tokens.get("access_token"),
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=tokens.get("client_id"),
        client_secret=tokens.get("client_secret"),
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
    )
    return build("gmail", "v1", credentials=creds)


RETRYABLE_REASONS = {
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "backendError",
}


def _execute_with_retry(request, max_retries: int = 8):
    retry = 0
    while True:
        try:
            return request.execute()
        except HttpError as err:
            retry += 1
            status = getattr(err.resp, "status", None)
            body = str(err)
            retryable = status in {429, 500, 503} or any(reason in body for reason in RETRYABLE_REASONS)
            if (not retryable) or retry > max_retries:
                raise
            sleep_for = min(60, 2**retry)
            time.sleep(sleep_for)


def fetch_messages(tokens: dict, max_results: int = 0, page_size: int = 100) -> list[dict]:
    return list(iter_messages(tokens=tokens, max_results=max_results, page_size=page_size))


def iter_messages(tokens: dict, max_results: int = 0, page_size: int = 100):
    service = build_service(tokens)
    page_token = None
    total = 0

    while True:
        listed = _execute_with_retry(
            service.users().messages().list(
                userId="me",
                maxResults=min(page_size, 500),
                pageToken=page_token,
            )
        )
        page_messages = listed.get("messages", [])
        page_token = listed.get("nextPageToken")

        for msg in page_messages:
            if max_results > 0 and total >= max_results:
                return
            details = _execute_with_retry(
                service.users().messages().get(userId="me", id=msg["id"], format="full")
            )
            headers = details.get("payload", {}).get("headers", [])
            header_map = {h.get("name", "").lower(): h.get("value", "") for h in headers}
            total += 1
            yield {
                "gmail_message_id": details.get("id"),
                "sender": header_map.get("from", ""),
                "subject": header_map.get("subject", "(No Subject)"),
                "snippet": details.get("snippet", ""),
                "body_text": _decode_body(details.get("payload", {}))[:6000],
            }

        if not page_token:
            return

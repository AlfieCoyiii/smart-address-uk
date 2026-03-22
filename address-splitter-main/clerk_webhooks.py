"""
Verify Clerk webhooks (Svix) and parse JSON body.
Set CLERK_WEBHOOK_SIGNING_SECRET in .env (Dashboard → Webhooks → Signing secret).
"""
import json
import os
from typing import Any

try:
    from svix.webhooks import Webhook, WebhookVerificationError
    _SVIX = True
except ImportError:
    Webhook = None  # type: ignore[misc, assignment]
    WebhookVerificationError = Exception  # type: ignore[misc, assignment]
    _SVIX = False


def verify_clerk_webhook_payload(body: bytes, headers: dict[str, str]) -> dict[str, Any]:
    """
    Verify Svix signature and return the event JSON dict.
    Raises ValueError on missing config or bad signature.
    """
    secret = (os.environ.get("CLERK_WEBHOOK_SIGNING_SECRET") or "").strip()
    if not secret:
        raise ValueError("CLERK_WEBHOOK_SIGNING_SECRET is not set")
    if not _SVIX or Webhook is None:
        raise ValueError("svix package not installed (pip install svix)")
    wh = Webhook(secret)
    hdrs = {
        "svix-id": headers.get("svix-id") or headers.get("Svix-Id") or "",
        "svix-timestamp": headers.get("svix-timestamp") or headers.get("Svix-Timestamp") or "",
        "svix-signature": headers.get("svix-signature") or headers.get("Svix-Signature") or "",
    }
    if not all(hdrs.values()):
        raise ValueError("Missing Svix headers")
    try:
        parsed = wh.verify(body, hdrs)
    except WebhookVerificationError as e:
        raise ValueError(f"Invalid webhook signature: {e}") from e
    if isinstance(parsed, bytes):
        return json.loads(parsed.decode("utf-8"))
    if isinstance(parsed, str):
        return json.loads(parsed)
    if isinstance(parsed, dict):
        return parsed
    return dict(parsed)

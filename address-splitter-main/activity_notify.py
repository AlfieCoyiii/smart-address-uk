"""
Optional Slack/Discord notifications for site activity (no PII in messages).

Set ACTIVITY_NOTIFY_WEBHOOK_URL on the API service to enable.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
import urllib.request

_log = logging.getLogger("activity_notify")

_WEBHOOK = (os.environ.get("ACTIVITY_NOTIFY_WEBHOOK_URL") or "").strip()
_RATE_LIMIT_SECONDS = int(os.environ.get("ACTIVITY_NOTIFY_RATE_LIMIT_SECONDS") or "90")

_ALLOWED_EVENTS = frozenset(
    {
        "page_view",
        "pricing_view",
        "demo_view",
        "sign_in_view",
        "sign_up_view",
        "parse_success",
    }
)

_recent: dict[str, float] = {}


def _ip_hint(ip: str) -> str:
    if not ip:
        return "unknown"
    return hashlib.sha256(ip.encode()).hexdigest()[:8]


def _should_notify(ip: str, event: str) -> bool:
    if not _WEBHOOK:
        return False
    now = time.time()
    key = f"{ip}:{event}"
    last = _recent.get(key, 0.0)
    if now - last < _RATE_LIMIT_SECONDS:
        return False
    _recent[key] = now
    if len(_recent) > 5000:
        cutoff = now - _RATE_LIMIT_SECONDS * 2
        for k in list(_recent.keys()):
            if _recent[k] < cutoff:
                del _recent[k]
    return True


def _post_webhook(text: str) -> None:
    if not _WEBHOOK:
        return
    payload = json.dumps({"text": text, "content": text}).encode()
    req = urllib.request.Request(
        _WEBHOOK,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as exc:
        _log.warning("Activity webhook failed: %s", exc)


def notify_activity(
    event: str,
    *,
    ip: str = "",
    path: str = "",
    signed_in: bool = False,
    extra: str = "",
) -> None:
    if event not in _ALLOWED_EVENTS:
        return
    if not _should_notify(ip or "unknown", event):
        return

    auth = "signed in" if signed_in else "anonymous"
    parts = [f"SmartAddressUK · {event.replace('_', ' ')}"]
    if path:
        parts.append(path)
    parts.append(auth)
    if extra:
        parts.append(extra)
    parts.append(f"visitor={_ip_hint(ip)}")
    text = " · ".join(parts)
    threading.Thread(target=_post_webhook, args=(text,), daemon=True).start()

"""
Clerk Backend API helpers: list org members and check if user is org admin.
Uses CLERK_SECRET_KEY. Required for team management (only admins can change settings).
"""
import os
from typing import Any

try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    os.environ.setdefault("REQUESTS_CA_BUNDLE", certifi.where())
except ImportError:
    pass

try:
    import requests
    _REQUESTS_AVAILABLE = True
except ImportError:
    _REQUESTS_AVAILABLE = False

CLERK_API_BASE = "https://api.clerk.com/v1"


def _secret_key() -> str | None:
    key = (os.environ.get("CLERK_SECRET_KEY") or "").strip()
    return key or None


def get_org_memberships(org_id: str) -> list[dict[str, Any]]:
    """
    Fetch organization memberships from Clerk. Returns list of membership objects
    with publicUserData.userId, role, etc. Returns [] on error or if not configured.
    """
    if not _REQUESTS_AVAILABLE or not _secret_key():
        return []
    url = f"{CLERK_API_BASE}/organizations/{org_id}/memberships"
    try:
        r = requests.get(
            url,
            headers={"Authorization": f"Bearer {_secret_key()}", "Content-Type": "application/json"},
            timeout=10,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return data.get("data") or []
    except Exception:
        return []


def _user_id_from_membership(m: dict[str, Any]) -> str | None:
    """Extract user id from a Clerk membership object (handles snake_case and camelCase)."""
    pub = m.get("public_user_data") or m.get("publicUserData") or {}
    return pub.get("user_id") or pub.get("userId")


def is_org_admin(org_id: str, user_id: str) -> bool:
    """True if user_id has org:admin role in this org."""
    for m in get_org_memberships(org_id):
        uid = _user_id_from_membership(m)
        if uid == user_id:
            role = (m.get("role") or "").lower()
            return role == "org:admin" or role == "admin"
    return False


def get_org_members_with_roles(org_id: str) -> list[dict[str, Any]]:
    """Return list of { user_id, role, first_name, last_name } for org members."""
    out = []
    for m in get_org_memberships(org_id):
        pub = m.get("public_user_data") or m.get("publicUserData") or {}
        uid = _user_id_from_membership(m)
        if not uid:
            continue
        out.append({
            "user_id": uid,
            "role": m.get("role") or "org:member",
            "first_name": (pub.get("first_name") or pub.get("firstName") or ""),
            "last_name": (pub.get("last_name") or pub.get("lastName") or ""),
        })
    return out

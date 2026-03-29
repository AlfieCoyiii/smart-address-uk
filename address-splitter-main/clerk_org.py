"""
Clerk Backend API helpers: list org members, check admin, and ensure each user has a workspace org.
Uses CLERK_SECRET_KEY. Required for team management (only admins can change settings).
"""
import os
import re
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
    """Return list of { user_id, role, first_name, last_name, email } for org members."""
    out = []
    for m in get_org_memberships(org_id):
        pub = m.get("public_user_data") or m.get("publicUserData") or {}
        uid = _user_id_from_membership(m)
        if not uid:
            continue
        u = fetch_clerk_user(uid)
        email = primary_email_from_clerk_user(u) if u else ""
        out.append({
            "user_id": uid,
            "role": m.get("role") or "org:member",
            "first_name": (pub.get("first_name") or pub.get("firstName") or ""),
            "last_name": (pub.get("last_name") or pub.get("lastName") or ""),
            "email": email,
        })
    return out


def _auth_headers() -> dict[str, str]:
    sk = _secret_key()
    return {
        "Authorization": f"Bearer {sk}",
        "Content-Type": "application/json",
    }


def fetch_clerk_user(user_id: str) -> dict[str, Any] | None:
    """GET /users/{user_id} — full user object for naming."""
    if not _REQUESTS_AVAILABLE or not _secret_key():
        return None
    try:
        r = requests.get(
            f"{CLERK_API_BASE}/users/{user_id}",
            headers=_auth_headers(),
            timeout=15,
        )
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def list_user_organization_memberships(user_id: str) -> list[dict[str, Any]]:
    """GET /users/{user_id}/organization_memberships"""
    if not _REQUESTS_AVAILABLE or not _secret_key():
        return []
    try:
        r = requests.get(
            f"{CLERK_API_BASE}/users/{user_id}/organization_memberships",
            headers=_auth_headers(),
            params={"limit": 100},
            timeout=15,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        return data.get("data") or []
    except Exception:
        return []


def primary_email_from_clerk_user(user: dict[str, Any]) -> str:
    """Primary email for display (e.g. team roster when name is unset)."""
    emails = user.get("email_addresses") or user.get("emailAddresses") or []
    primary_id = user.get("primary_email_address_id") or user.get("primaryEmailAddressId")
    for e in emails:
        if not isinstance(e, dict):
            continue
        eid = e.get("id")
        addr = (e.get("email_address") or e.get("emailAddress") or "").strip()
        if primary_id and eid == primary_id:
            return addr
    if emails and isinstance(emails[0], dict):
        return (emails[0].get("email_address") or emails[0].get("emailAddress") or "").strip()
    return ""


def workspace_name_from_clerk_user(user: dict[str, Any]) -> str:
    """
    Default workspace title: "Firstname's workspace" or "{local-part-of-email}'s workspace".
    """
    first = (user.get("first_name") or user.get("firstName") or "").strip()
    if first:
        display = first[0].upper() + first[1:].lower() if len(first) > 1 else first.upper()
        base = f"{display}'s workspace"
    else:
        emails = user.get("email_addresses") or user.get("emailAddresses") or []
        primary_id = user.get("primary_email_address_id") or user.get("primaryEmailAddressId")
        email_str = ""
        for e in emails:
            if not isinstance(e, dict):
                continue
            eid = e.get("id")
            addr = e.get("email_address") or e.get("emailAddress") or ""
            if primary_id and eid == primary_id:
                email_str = addr
                break
        if not email_str and emails and isinstance(emails[0], dict):
            email_str = emails[0].get("email_address") or emails[0].get("emailAddress") or ""
        local = (email_str.split("@", 1)[0] if "@" in email_str else email_str) or "user"
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "", local) or "user"
        base = f"{safe}'s workspace"
    return base[:128]


def create_clerk_organization(name: str, created_by_user_id: str) -> dict[str, Any] | None:
    """POST /organizations — creator becomes org admin."""
    if not _REQUESTS_AVAILABLE or not _secret_key():
        return None
    try:
        r = requests.post(
            f"{CLERK_API_BASE}/organizations",
            headers=_auth_headers(),
            json={"name": name, "created_by": created_by_user_id},
            timeout=20,
        )
        if r.status_code not in (200, 201):
            print(f"[clerk_org] Create organization failed {r.status_code}: {r.text[:500]}")
            return None
        return r.json()
    except Exception as e:
        print(f"[clerk_org] Create organization error: {e}")
        return None


def ensure_personal_workspace(user_id: str, user_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    If the user has no Clerk organizations, create one with a default name and migrate
    personal usage (SQLite) to org usage.

    Returns: { "org_id": str, "name": str, "created": bool }

    Raises RuntimeError on misconfiguration or repeated failure.
    """
    from usage_limits import migrate_personal_usage_to_org

    if not _secret_key():
        raise RuntimeError("CLERK_SECRET_KEY is not set")

    mems = list_user_organization_memberships(user_id)
    if mems:
        first = mems[0]
        org = first.get("organization") or {}
        oid = org.get("id")
        name = org.get("name") or ""
        if oid:
            return {"org_id": oid, "name": name, "created": False}

    if user_payload is None:
        user_payload = fetch_clerk_user(user_id)
    if not user_payload:
        raise RuntimeError("Could not load user from Clerk")

    ws_name = workspace_name_from_clerk_user(user_payload)
    org_json = create_clerk_organization(ws_name, user_id)
    if not org_json:
        raise RuntimeError("Clerk rejected organization creation")
    oid = org_json.get("id")
    if not oid:
        raise RuntimeError("Clerk returned organization without id")

    migrate_personal_usage_to_org(user_id, oid)
    oname = org_json.get("name") or ws_name
    return {"org_id": oid, "name": oname, "created": True}

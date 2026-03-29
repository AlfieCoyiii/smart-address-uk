"""
FastAPI backend that runs the same address parsing pipeline as address_parser1.py
and Stripe checkout/portal for subscriptions.
Run from the address-splitter-main directory:
    uvicorn parse_api:app --reload --port 8000
"""
import os
import pickle
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

from dotenv import load_dotenv
# Load .env from the backend directory so Stripe key is found no matter where uvicorn is run from
load_dotenv(os.path.join(BASE_DIR, ".env"))

from contextlib import asynccontextmanager
import logging
import secrets
from typing import Annotated

from fastapi import FastAPI, HTTPException, Request, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, model_validator

from usage_limits import (
    FREE_MONTHLY_TOKENS,
    ANONYMOUS_MAX_ADDRESSES,
    check_anonymous_rate_limit,
    check_signed_in_parse_rate_limit,
    get_usage,
    consume_tokens,
    consume_tokens_paid,
    set_overage_limit,
    get_overage_limit,
    get_org_settings,
    set_org_settings,
    get_paid_monthly_overage_max,
    set_paid_monthly_overage_max,
    get_member_settings,
    set_member_settings,
    get_member_usage,
    get_members_usage,
    migrate_personal_usage_to_org,
    admin_list_usage_for_period,
    admin_get_usage_row,
    admin_list_audit,
    admin_grant_goodwill,
)
from clerk_auth import verify_clerk_token, verify_clerk_token_with_reason
from clerk_org import (
    is_org_admin,
    get_org_members_with_roles,
    list_user_organization_memberships,
    fetch_clerk_user,
    primary_email_from_clerk_user,
    maybe_rename_new_organization_from_creator,
)
from clerk_webhooks import verify_clerk_webhook_payload

# Stripe (optional; set STRIPE_SECRET_KEY to enable billing)
try:
    import stripe
except Exception:
    stripe = None

# Key set at startup in lifespan so .env is definitely loaded
stripe_secret_key: str | None = None

from address_parsing_core import parse_address_multi, extract_flat_from_building
from train_crf_address_ner import predict_address_fields

# Load CRF model once at startup
crf_model = None


def load_crf_model():
    global crf_model
    path = os.path.join(BASE_DIR, "crf_model_v3_110925.pkl")
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"CRF model not found at {path}. Add crf_model_v3_110925.pkl to run the parser."
        )
    with open(path, "rb") as f:
        crf_model = pickle.load(f)
    return crf_model


def _configure_production_logging() -> None:
    """
    Keep dependency loggers quiet so they never echo HTTP traffic or payloads to stdout
    (Render and similar hosts capture stdout/stderr as 'logs').
    Uvicorn access lines are method + path + status only — they do not include JSON bodies.
    """
    for name in ("httpx", "httpcore", "urllib3", "hpack", "http11"):
        logging.getLogger(name).setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global stripe_secret_key
    _configure_production_logging()
    # Load Stripe key from .env in this directory (runs after app is ready)
    env_path = os.path.join(BASE_DIR, ".env")
    load_dotenv(env_path)
    stripe_secret_key = (os.environ.get("STRIPE_SECRET_KEY") or "").strip()
    if stripe is not None and stripe_secret_key:
        stripe.api_key = stripe_secret_key
        print("Stripe: key loaded from .env")
    else:
        print("Stripe: not configured (no STRIPE_SECRET_KEY in", env_path, ")")
    try:
        load_crf_model()
        print("Parser API ready: CRF model loaded.")
    except FileNotFoundError as e:
        print(f"Warning: {e}")
    yield
    pass


app = FastAPI(
    title="Smart Address UK Parser API",
    description="Parses UK addresses into structured fields using address_parsing_core + CRF.",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
def unhandled_exception_handler(request, exc):
    """Ensure every unhandled error returns JSON with 'detail' so the frontend can show the real message."""
    from fastapi.responses import JSONResponse
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    detail = str(exc) if str(exc) else repr(exc)
    return JSONResponse(status_code=500, content={"detail": f"Parser error: {detail}"})

def _cors_allow_origins() -> list[str]:
    """
    Browser calls to the API from another origin require CORS.
    Local dev: leave CORS_ALLOWED_ORIGINS unset (defaults to localhost).
    Production: set CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
    """
    raw = (os.environ.get("CORS_ALLOWED_ORIGINS") or "").strip()
    if raw:
        return [o.strip() for o in raw.split(",") if o.strip()]
    return ["http://localhost:8080", "http://127.0.0.1:8080"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/webhooks/clerk")
async def clerk_webhook(request: Request):
    """
    Clerk → Webhooks → Add endpoint URL: https://<your-api-host>/webhooks/clerk
    Subscribe to: user.created (optional), organization.created (recommended).
    Set CLERK_WEBHOOK_SIGNING_SECRET from the webhook's signing secret.
    """
    body = await request.body()
    try:
        hdrs = {k: v for k, v in request.headers.items()}
        event = verify_clerk_webhook_payload(body, hdrs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    etype = event.get("type")
    data = event.get("data") or {}
    # Organizations are created by Clerk enrollment. We no longer call ensure_personal_workspace
    # on user.created — it duplicated orgs when both Clerk and our API created one.
    if etype == "user.created":
        pass
    elif etype == "organization.created":
        try:
            maybe_rename_new_organization_from_creator(data if isinstance(data, dict) else {})
        except Exception as e:
            logging.getLogger(__name__).warning("organization.created handler: %s", e)
    return {"received": True}


class ParseRequest(BaseModel):
    addresses: list[str]


class ParsedAddressResponse(BaseModel):
    flatNumber: str
    buildingName: str
    streetNumber: str
    streetName: str
    town: str
    postcodeStart: str
    postcodeEnd: str


class UnsplitEntry(BaseModel):
    line: int  # 1-based line number in the input
    address: str


class ParseResponse(BaseModel):
    results: list[ParsedAddressResponse]
    unsplit: list[UnsplitEntry] = []  # addresses that could not be split (blank row in results)


def run_parser_pipeline(addresses: list[str]) -> list[dict]:
    """Same pipeline as address_parser1.py: parse_address_multi → CRF → merge + extract_flat."""
    if not addresses:
        return []

    if crf_model is None:
        raise HTTPException(
            status_code=503,
            detail="Parser not available: CRF model not loaded.",
        )

    # Optional: limit input size
    max_addresses = 3000
    if len(addresses) > max_addresses:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {max_addresses} addresses per request.",
        )

    allow_autocorrect_list = [False] * len(addresses)
    result_list, stats, unidentified, unidentified_postcodes, applied_autocorrects, unidentified_streets, rest_outputs_local, _, autocorrect_counts = parse_address_multi(
        addresses,
        progress_callback=None,
        allow_autocorrect_list=allow_autocorrect_list,
    )

    rest_outputs_normalized = [rest.title() for rest in rest_outputs_local]
    crf_tags_list = predict_address_fields(rest_outputs_normalized, crf_model)

    results = []
    for i, line in enumerate(result_list):
        parts = line.split("\t")
        if len(parts) < 9:
            parts.extend([""] * (9 - len(parts)))

        tokens = rest_outputs_normalized[i].split() if i < len(rest_outputs_normalized) else []
        tags = crf_tags_list[i] if i < len(crf_tags_list) else []
        building, street, number = [], [], []
        for token, tag in zip(tokens, tags):
            if tag.endswith("BUILDING"):
                building.append(token)
            elif tag.endswith("STREET"):
                street.append(token)
            elif tag.endswith("NUMBER"):
                number.append(token)

        parts[1] = " ".join(building)
        parts[2] = " ".join(number)
        parts[3] = " ".join(street)

        flat_number, building_name = extract_flat_from_building(parts[1], parts[0])
        parts[0] = flat_number
        parts[1] = building_name

        # Blank row if missing town or postcode (match address_parser1 behaviour)
        if (not parts[5] or not parts[6]) or not parts[4]:
            flat_number = building_name = street_number = street_name = town = outward = inward = ""
        else:
            flat_number, building_name = parts[0], parts[1]
            street_number, street_name = parts[2], parts[3]
            town, outward, inward = parts[4], parts[5], parts[6]

        results.append({
            "flatNumber": flat_number or "",
            "buildingName": building_name or "",
            "streetNumber": street_number or "",
            "streetName": street_name or "",
            "town": town or "",
            "postcodeStart": outward or "",
            "postcodeEnd": inward or "",
        })
    return results


def _build_unsplit(addresses: list[str], results: list[dict]) -> list[dict]:
    """Build list of {line: 1-based, address: str} for rows that could not be split (no postcode)."""
    unsplit = []
    for i, r in enumerate(results):
        if i < len(addresses) and not (r.get("postcodeStart") or r.get("postcodeEnd")):
            unsplit.append({"line": i + 1, "address": addresses[i]})
    return unsplit


MIN_ADDRESS_CHARS = int(os.environ.get("MIN_ADDRESS_CHARS", "12"))
MAX_SKIPPED_LINES_PER_REQUEST = int(os.environ.get("MAX_SKIPPED_LINES_PER_REQUEST", "500"))

# Outward / inward UK postcode shape (same family as address_parsing_core)
_UK_POST_OUT = re.compile(r"^[A-Z]{1,2}[0-9][0-9A-Z]?$", re.IGNORECASE)
_UK_POST_IN = re.compile(r"^[0-9][A-Z]{2}$", re.IGNORECASE)


def is_billable_split_output(r: dict) -> bool:
    """Bill when output has a UK postcode (outward + inward). No other fields required."""
    po = (r.get("postcodeStart") or "").strip().upper().replace(" ", "")
    pi = (r.get("postcodeEnd") or "").strip().upper().replace(" ", "")
    if not po or not pi:
        return False
    if po == "GIR" and pi == "0AA":
        return True
    return bool(_UK_POST_OUT.match(po)) and bool(_UK_POST_IN.match(pi))


def line_should_skip_parser(line: str) -> bool:
    """
    Skip the expensive parser for lines that cannot plausibly be UK addresses.
    Stops spam like 'a' / 'A' repeated without using credits or CPU.
    """
    s = line.strip()
    if len(s) < MIN_ADDRESS_CHARS:
        return True
    if re.search(r"\d", s):
        return False
    if "," in s or s.count(" ") >= 2:
        return False
    return True


def merge_parse_results(addresses: list[str]) -> tuple[list[dict], list[dict], int, int]:
    """
    Full results + unsplit. Credits = rows with a valid UK postcode in output; others are unsplit.
    Returns (results, unsplit, n_sent_to_parser, n_billable_rows).
    """
    n = len(addresses)
    empty = {
        "flatNumber": "",
        "buildingName": "",
        "streetNumber": "",
        "streetName": "",
        "town": "",
        "postcodeStart": "",
        "postcodeEnd": "",
    }
    results: list[dict] = [dict(empty) for _ in range(n)]
    unsplit: list[dict] = []
    to_parse: list[str] = []
    parse_positions: list[int] = []

    for i, a in enumerate(addresses):
        if line_should_skip_parser(a):
            unsplit.append({"line": i + 1, "address": addresses[i]})
        else:
            to_parse.append(a)
            parse_positions.append(i)

    n_sent = len(to_parse)
    if not to_parse:
        unsplit.sort(key=lambda x: x["line"])
        return results, unsplit, 0, 0

    parsed = run_parser_pipeline(to_parse)
    n_billable = 0
    for j, pos in enumerate(parse_positions):
        r = parsed[j]
        if is_billable_split_output(r):
            results[pos] = r
            n_billable += 1
        else:
            results[pos] = dict(empty)
            unsplit.append({"line": pos + 1, "address": addresses[pos]})

    unsplit.sort(key=lambda x: x["line"])
    return results, unsplit, n_sent, n_billable


def _skipped_line_count(addresses: list[str]) -> int:
    return sum(1 for a in addresses if line_should_skip_parser(a))


def _reject_too_many_skipped(addresses: list[str]) -> None:
    n_skip = _skipped_line_count(addresses)
    if n_skip > MAX_SKIPPED_LINES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Too many lines ({n_skip}) don't look like UK addresses "
                f"(need at least {MIN_ADDRESS_CHARS} characters, and a digit or several words). "
                "Remove empty or junk lines, or split into smaller batches."
            ),
        )


@app.post("/parse", response_model=ParseResponse)
def parse_addresses(body: ParseRequest, request: Request):
    """Parse UK addresses. Credits only for lines sent to the parser; failed splits are refunded."""
    # Never log body.addresses or raw request JSON — appears in host logs (stdout/stderr).
    addresses = [a.strip() for a in body.addresses if a.strip()]
    if not addresses:
        raise HTTPException(status_code=400, detail="No addresses provided.")

    auth_header = request.headers.get("authorization") or ""
    org_id_header = (request.headers.get("x-org-id") or "").strip() or None
    user_id = verify_clerk_token(auth_header) if auth_header else None

    if user_id is None:
        if len(addresses) > ANONYMOUS_MAX_ADDRESSES:
            raise HTTPException(
                status_code=400,
                detail=f"Sign in to split more than {ANONYMOUS_MAX_ADDRESSES} address at a time.",
            )
        err = check_anonymous_rate_limit(_client_ip(request))
        if err:
            raise HTTPException(status_code=429, detail=err)
        try:
            results, unsplit, _, _ = merge_parse_results(addresses)
            return ParseResponse(
                results=[ParsedAddressResponse(**r) for r in results],
                unsplit=[UnsplitEntry(**u) for u in unsplit],
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Parser error: {str(e)}")

    org_id = org_id_header
    if user_id and org_id:
        migrate_personal_usage_to_org(user_id, org_id)
    _reject_too_many_skipped(addresses)
    rate_key = f"{org_id or 'personal'}:{user_id}"
    rl_err = check_signed_in_parse_rate_limit(rate_key)
    if rl_err:
        raise HTTPException(status_code=429, detail=rl_err)

    # Bill one credit per output row that has a valid UK postcode.
    if org_id and _org_has_active_subscription(org_id):
        plan_cap, plan_slug = _org_paid_plan_info(org_id)
        if plan_cap is None:
            plan_cap = 5_000
        try:
            results, unsplit, n_sent, billable_count = merge_parse_results(addresses)
            if billable_count > 0:
                overage_pid = _overage_price_id_for_plan_slug(plan_slug)
                paid_ov_max = get_paid_monthly_overage_max(org_id)
                allow_ov = bool(overage_pid) and (paid_ov_max is None or paid_ov_max > 0)
                err, ovg = consume_tokens_paid(
                    org_id,
                    billable_count,
                    plan_cap,
                    user_id=user_id,
                    allow_overage=allow_ov,
                    paid_overage_max=paid_ov_max,
                )
                if err:
                    raise HTTPException(status_code=402, detail=err)
                if ovg > 0 and overage_pid:
                    _report_stripe_metered_overage(org_id, overage_pid, ovg)
            return ParseResponse(
                results=[ParsedAddressResponse(**r) for r in results],
                unsplit=[UnsplitEntry(**u) for u in unsplit],
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Parser error: {str(e)}")

    try:
        results, unsplit, n_sent, billable_count = merge_parse_results(addresses)
        if billable_count > 0:
            err = consume_tokens(org_id, user_id, billable_count)
            if err:
                raise HTTPException(status_code=402, detail=err)
        return ParseResponse(
            results=[ParsedAddressResponse(**r) for r in results],
            unsplit=[UnsplitEntry(**u) for u in unsplit],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parser error: {str(e)}")


@app.get("/whoami")
def whoami(request: Request):
    """
    Debug: returns what the backend sees for auth. Call with same Authorization + X-Org-Id
    as /parse. verify_reason explains why token was rejected (e.g. JWKS not set, JWT invalid).
    """
    auth_header = (request.headers.get("authorization") or "").strip()
    org_id = (request.headers.get("x-org-id") or "").strip() or None
    has_bearer = auth_header.lower().startswith("bearer ") and len(auth_header) > 10
    user_id, verify_reason = verify_clerk_token_with_reason(auth_header) if auth_header else (None, "No Authorization header")
    return {
        "auth_header_present": bool(auth_header),
        "has_bearer_token": has_bearer,
        "user_id": user_id,
        "org_id_from_header": org_id,
        "verify_reason": verify_reason,
        "hint": f"user_id is set ({user_id[:12]}…)" if user_id else f"Backend does not recognise this token. Reason: {verify_reason}",
    }


@app.get("/parse-context")
def parse_context(request: Request):
    """
    Debug: what would the backend use for the next /parse call? Same headers as /parse.
    Shows org_id, has_subscription, plan_cap, and current usage so you can verify enforcement.
    """
    auth_header = (request.headers.get("authorization") or "").strip()
    org_id = (request.headers.get("x-org-id") or "").strip() or None
    user_id = verify_clerk_token(auth_header) if auth_header else None
    if not user_id:
        return {"error": "Not signed in", "org_id_from_header": org_id}
    has_sub = _org_has_active_subscription(org_id) if org_id else False
    plan_cap, plan_slug = _org_paid_plan_info(org_id) if org_id else (None, None)
    tokens_used, overage_used, _ = get_usage(org_id, user_id)
    tokens_limit = plan_cap if plan_cap is not None else FREE_MONTHLY_TOKENS
    return {
        "org_id_from_header": org_id,
        "user_id": user_id,
        "has_active_subscription": has_sub,
        "plan_cap": plan_cap,
        "plan_slug": plan_slug,
        "tokens_used": tokens_used,
        "tokens_limit": tokens_limit,
        "would_enforce_cap": has_sub and plan_cap is not None,
    }


@app.get("/usage")
def get_usage_endpoint(request: Request):
    """Return current period usage for the authenticated org/user. Requires Authorization + X-Org-Id (optional)."""
    auth_header = request.headers.get("authorization") or ""
    org_id = (request.headers.get("x-org-id") or "").strip() or None
    user_id = verify_clerk_token(auth_header) if auth_header else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to view usage.")
    if org_id:
        migrate_personal_usage_to_org(user_id, org_id)
    tokens_used, overage_used, _free_overage_limit = get_usage(org_id, user_id)
    plan_cap, plan_slug = _org_paid_plan_info(org_id) if org_id else (None, None)
    tokens_limit = plan_cap if plan_cap is not None else FREE_MONTHLY_TOKENS
    paid_ov = get_paid_monthly_overage_max(org_id) if org_id and plan_cap else None
    overage_pid = _overage_price_id_for_plan_slug(plan_slug) if plan_slug else None
    return {
        "tokens_used": tokens_used,
        "tokens_limit": tokens_limit,
        "overage_used": overage_used if plan_cap is not None else 0,
        "overage_limit": paid_ov if plan_cap is not None else None,
        "plan": plan_slug if plan_slug else "free",
        "paid_overage_billing_enabled": bool(plan_cap is not None and overage_pid),
    }


class OverageLimitUpdate(BaseModel):
    overage_limit: int | None


@app.patch("/settings/overage-limit")
def update_overage_limit(body: OverageLimitUpdate, request: Request):
    """Deprecated: free-tier overage is disabled. Endpoint kept for compatibility."""
    auth_header = request.headers.get("authorization") or ""
    org_id = (request.headers.get("x-org-id") or "").strip()
    user_id = verify_clerk_token(auth_header) if auth_header else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to update settings.")
    if not org_id:
        raise HTTPException(status_code=400, detail="Select a team (X-Org-Id) to set overage limit.")
    raise HTTPException(status_code=400, detail="Free-plan overage is no longer available. Upgrade to a paid plan.")


class EnsureWorkspaceOut(BaseModel):
    org_id: str
    name: str
    created: bool


@app.post("/team/ensure-workspace", response_model=EnsureWorkspaceOut)
def post_team_ensure_workspace(request: Request):
    """
    Return the user's existing Clerk workspace and migrate SQLite usage (user:* → org:*) if needed.
    Does **not** create organizations — Clerk Dashboard enrollment handles that.
    """
    auth_header = request.headers.get("authorization") or ""
    user_id = verify_clerk_token(auth_header) if auth_header else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in required.")
    mems = list_user_organization_memberships(user_id)
    if not mems:
        raise HTTPException(
            status_code=503,
            detail="No workspace yet. Finish Clerk sign-up (organization is created by Clerk). Refresh in a moment.",
        )
    first = mems[0]
    org = first.get("organization") or {}
    oid = org.get("id")
    name = org.get("name") or ""
    if not oid:
        raise HTTPException(status_code=503, detail="Workspace not ready. Try again.")
    migrate_personal_usage_to_org(user_id, oid)
    return EnsureWorkspaceOut(org_id=oid, name=name, created=False)


# ---------- Team management (settings, members, usage, permissions) ----------



class MemberSettingsUpdate(BaseModel):
    can_see_usage: bool | None = None
    personal_limit: int | None = None


def _require_team_auth(request: Request) -> tuple[str, str]:
    """Return (org_id, user_id). Raises 401/400 if not signed in or no org."""
    auth_header = request.headers.get("authorization") or ""
    org_id = (request.headers.get("x-org-id") or "").strip() or None
    user_id = verify_clerk_token(auth_header) if auth_header else None
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to manage your team.")
    if not org_id:
        raise HTTPException(status_code=400, detail="No team selected.")
    return org_id, user_id


@app.get("/team/settings")
def get_team_settings(request: Request):
    """Get org settings (overage_limit, allow_all_see_usage) and current user's role and usage."""
    org_id, user_id = _require_team_auth(request)
    settings = get_org_settings(org_id)
    tokens_used, overage_used, _free_ov = get_usage(org_id, user_id)
    plan_cap, plan_slug = _org_paid_plan_info(org_id) if org_id else (None, None)
    tokens_limit = plan_cap if plan_cap is not None else FREE_MONTHLY_TOKENS
    paid_ov_max = settings.get("paid_monthly_overage_max")
    overage_pid = _overage_price_id_for_plan_slug(plan_slug) if plan_slug else None
    is_admin = is_org_admin(org_id, user_id)
    can_see_usage, personal_limit = get_member_settings(org_id, user_id)
    return {
        "org_settings": {
            "overage_limit": None,
            "paid_monthly_overage_max": paid_ov_max,
            "allow_all_see_usage": settings.get("allow_all_see_usage", True),
        },
        "is_admin": is_admin,
        "tokens_used": tokens_used,
        "tokens_limit": tokens_limit,
        "overage_used": overage_used if plan_cap is not None else 0,
        "overage_limit": paid_ov_max if plan_cap is not None else None,
        "plan": plan_slug or "free",
        "paid_overage_billing_enabled": bool(plan_cap is not None and overage_pid),
        "can_see_usage": can_see_usage,
        "personal_limit": personal_limit,
    }


class TeamSettingsPatch(BaseModel):
    overage_limit: int | None = None
    paid_monthly_overage_max: int | None = None
    allow_all_see_usage: bool | None = None


@app.patch("/team/settings")
def update_team_settings(body: TeamSettingsPatch, request: Request):
    """Admin only. paid_monthly_overage_max: omit to leave unchanged; null = unlimited metered; 0 = no overage; N = cap."""
    org_id, user_id = _require_team_auth(request)
    if not is_org_admin(org_id, user_id):
        raise HTTPException(status_code=403, detail="Only team admins can change these settings.")
    patch = body.model_dump(exclude_unset=True)
    plan_cap, _ = _org_paid_plan_info(org_id)
    if "overage_limit" in patch:
        raise HTTPException(status_code=400, detail="Free-plan overage is disabled.")
    if "paid_monthly_overage_max" in patch:
        if plan_cap is None:
            raise HTTPException(status_code=400, detail="Paid overage applies only to teams with an active subscription.")
        v = patch["paid_monthly_overage_max"]
        if v is not None and (not isinstance(v, int) or isinstance(v, bool) or v < 0):
            raise HTTPException(
                status_code=400,
                detail="paid_monthly_overage_max must be a non-negative integer, or null for unlimited metered overage.",
            )
        set_paid_monthly_overage_max(org_id, v)
    if "allow_all_see_usage" in patch and patch["allow_all_see_usage"] is not None:
        set_org_settings(org_id, allow_all_see_usage=patch["allow_all_see_usage"])
    return get_team_settings(request)


@app.get("/team/members")
def get_team_members(request: Request):
    """
    Get team members with usage and permissions. Everyone in the org sees all members and their usage.
    If Clerk returns no members (e.g. only member), we always include the current user so they see themselves.
    """
    org_id, user_id = _require_team_auth(request)
    is_admin = is_org_admin(org_id, user_id)
    members_from_clerk = get_org_members_with_roles(org_id)
    usage_by_user = {uid: used for uid, used in get_members_usage(org_id)}
    out = []
    seen = set()
    for m in members_from_clerk:
        uid = m["user_id"]
        if uid in seen:
            continue
        seen.add(uid)
        can_see, personal_limit = get_member_settings(org_id, uid)
        tokens_used = usage_by_user.get(uid, 0)
        out.append({
            "user_id": uid,
            "role": m["role"],
            "first_name": m.get("first_name", ""),
            "last_name": m.get("last_name", ""),
            "email": m.get("email", ""),
            "tokens_used": tokens_used,
            "can_see_usage": can_see,
            "personal_limit": personal_limit,
        })
    # If Clerk returned no members (e.g. only member, or API issue), always show the current user
    if user_id not in seen:
        can_see, personal_limit = get_member_settings(org_id, user_id)
        tokens_used = usage_by_user.get(user_id, 0)
        u = fetch_clerk_user(user_id)
        em = primary_email_from_clerk_user(u) if u else ""
        out.append({
            "user_id": user_id,
            "role": "org:admin" if is_admin else "org:member",
            "first_name": "",
            "last_name": "",
            "email": em,
            "tokens_used": tokens_used,
            "can_see_usage": can_see,
            "personal_limit": personal_limit,
        })
    return {"members": out, "is_admin": is_admin}


@app.patch("/team/members/{member_user_id}")
def update_team_member(member_user_id: str, body: MemberSettingsUpdate, request: Request):
    """Update a member's can_see_usage and personal_limit. Admin only."""
    org_id, user_id = _require_team_auth(request)
    if not is_org_admin(org_id, user_id):
        raise HTTPException(status_code=403, detail="Only team admins can change member settings.")
    set_member_settings(
        org_id,
        member_user_id,
        can_see_usage=body.can_see_usage,
        personal_limit=body.personal_limit,
    )
    return {"ok": True}


@app.get("/health")
def health():
    """Health check; reports whether CRF model is loaded."""
    return {"status": "ok", "parser_ready": crf_model is not None}


@app.get("/stripe-status")
def stripe_status():
    """Whether Stripe is configured (for debugging). api_key_mode: live|test|unknown — Checkout matches this (test shows Sandbox)."""
    return {
        "stripe_configured": _stripe_enabled(),
        "stripe_module_loaded": stripe is not None,
        "key_set": bool(stripe_secret_key),
        "api_key_mode": _stripe_api_key_mode(),
    }


# ---------- Stripe (subscriptions linked to Clerk org) ----------

def _stripe_enabled():
    return stripe is not None and bool(stripe_secret_key)


def _stripe_api_key_mode() -> str | None:
    """Infer test vs live from secret key prefix (never expose the key)."""
    k = (stripe_secret_key or "").strip()
    if not k:
        return None
    if k.startswith("sk_live_"):
        return "live"
    if k.startswith("sk_test_"):
        return "test"
    return "unknown"


def _client_ip(request: Request) -> str:
    """Prefer X-Forwarded-For when behind a proxy."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


# Plan caps (addresses per month). Set STRIPE_PRICE_* in .env to match Stripe Dashboard.
def _price_id_to_cap(price_id: str) -> int | None:
    """Map Stripe price ID to monthly address cap. Returns None if unknown."""
    if not price_id:
        return None
    starter = (os.environ.get("STRIPE_PRICE_STARTER") or "").strip()
    pro = (os.environ.get("STRIPE_PRICE_PRO") or "").strip()
    corporate = (os.environ.get("STRIPE_PRICE_CORPORATE") or "").strip()
    enterprise = (os.environ.get("STRIPE_PRICE_ENTERPRISE") or "").strip()
    if price_id == starter:
        return 2_000
    if price_id == pro:
        return 5_000
    if price_id == corporate:
        return 15_000
    if enterprise and price_id == enterprise:
        try:
            return max(1, int((os.environ.get("STRIPE_ENTERPRISE_MONTHLY_CAP") or "15000").strip()))
        except ValueError:
            return 15_000  # same tier as corporate
    return None


def _price_id_to_plan(price_id: str) -> str | None:
    """Map Stripe price ID to plan slug for display. Returns None if unknown."""
    if not price_id:
        return None
    starter = (os.environ.get("STRIPE_PRICE_STARTER") or "").strip()
    pro = (os.environ.get("STRIPE_PRICE_PRO") or "").strip()
    corporate = (os.environ.get("STRIPE_PRICE_CORPORATE") or "").strip()
    enterprise = (os.environ.get("STRIPE_PRICE_ENTERPRISE") or "").strip()
    if price_id == starter:
        return "starter"
    if price_id == pro:
        return "pro"
    if price_id == corporate:
        return "corporate"
    if enterprise and price_id == enterprise:
        return "corporate"
    return None


def _all_overage_price_ids() -> set[str]:
    """Stripe metered line item price IDs — never use these to infer base plan."""
    ids = []
    for k in (
        "STRIPE_PRICE_OVERAGE_STARTER",
        "STRIPE_PRICE_OVERAGE_PRO",
        "STRIPE_PRICE_OVERAGE_CORPORATE",
        "STRIPE_PRICE_OVERAGE_ENTERPRISE",
    ):
        v = (os.environ.get(k) or "").strip()
        if v:
            ids.append(v)
    return set(ids)


def _product_meta_cap_plan(prod) -> tuple[int | None, str | None]:
    """Stripe Product metadata: address_cap / monthly_address_cap + optional plan_slug."""
    if not prod:
        return None, None
    meta = getattr(prod, "metadata", None) or (prod.get("metadata") if isinstance(prod, dict) else None) or {}
    if hasattr(meta, "to_dict"):
        meta = meta.to_dict()  # type: ignore[assignment]
    if not isinstance(meta, dict):
        meta = {}
    cap_s = meta.get("address_cap") or meta.get("monthly_address_cap") or meta.get("included_addresses")
    if cap_s:
        try:
            c = int(str(cap_s).replace(",", "").strip())
            if c > 0:
                slug = (meta.get("plan_slug") or meta.get("plan") or "corporate").strip().lower()
                if slug == "enterprise":
                    slug = "corporate"
                return c, slug
        except ValueError:
            pass
    return None, None


def _tier_from_label(label: str) -> tuple[int | None, str | None]:
    """Match plan from product name, price nickname, etc. Enterprise before Pro (same £120 as Pro in GBP)."""
    if not label:
        return None, None
    l = label.lower()
    if "enterprise" in l or "corporate" in l:
        return 15_000, "corporate"
    if "starter" in l:
        return 2_000, "starter"
    if "pro" in l:
        return 5_000, "pro"
    return None, None


def _plan_from_stripe_price(price) -> tuple[int | None, str | None]:
    """Resolve cap + slug from Price ID, env map, or Product name."""
    if not price:
        return None, None
    price_id = getattr(price, "id", None) or (price.get("id") if isinstance(price, dict) else None)
    cap = _price_id_to_cap(price_id)
    plan = _price_id_to_plan(price_id)
    if cap is not None and plan is not None:
        return cap, plan
    recurring = getattr(price, "recurring", None) or (price.get("recurring") if isinstance(price, dict) else None)
    ut = None
    if recurring:
        ut = getattr(recurring, "usage_type", None) or (recurring.get("usage_type") if isinstance(recurring, dict) else None)
    if ut == "metered":
        return None, None
    nick = (getattr(price, "nickname", None) or (price.get("nickname") if isinstance(price, dict) else None) or "").strip()
    tier = _tier_from_label(nick)
    if tier[0] is not None:
        return tier
    prod_ref = getattr(price, "product", None) or (price.get("product") if isinstance(price, dict) else None)
    prod_obj = prod_ref if prod_ref and not isinstance(prod_ref, str) else None
    prod_id = prod_ref if isinstance(prod_ref, str) else None
    if prod_obj:
        mc, mp = _product_meta_cap_plan(prod_obj)
        if mc is not None and mp is not None:
            return mc, mp
        n = (getattr(prod_obj, "name", None) or (prod_obj.get("name") if isinstance(prod_obj, dict) else None) or "").strip()
        desc = (getattr(prod_obj, "description", None) or (prod_obj.get("description") if isinstance(prod_obj, dict) else None) or "").strip()
        tier = _tier_from_label(f"{n} {desc} {nick}")
        if tier[0] is not None:
            return tier
    elif prod_id and _stripe_enabled():
        try:
            prod = stripe.Product.retrieve(prod_id)
            mc, mp = _product_meta_cap_plan(prod)
            if mc is not None and mp is not None:
                return mc, mp
            n = ((getattr(prod, "name", None) or prod.get("name") or "") if prod else "").strip()
            desc = ((getattr(prod, "description", None) or prod.get("description") or "") if prod else "").strip()
            tier = _tier_from_label(f"{n} {desc} {nick}")
            if tier[0] is not None:
                return tier
        except Exception:
            pass
    curr = (getattr(price, "currency", None) or (price.get("currency") if isinstance(price, dict) else None) or "").lower()
    ua = getattr(price, "unit_amount", None)
    if isinstance(price, dict) and ua is None:
        ua = price.get("unit_amount")
    if curr == "gbp" and ua:
        gbp_tier = {6_500: (2_000, "starter"), 12_000: (5_000, "pro"), 28_000: (15_000, "corporate")}
        if ua in gbp_tier:
            return gbp_tier[ua]
    return None, None


def _overage_price_id_for_plan_slug(plan_slug: str | None) -> str | None:
    """Metered price ID for per-address overage (6p / 4p / 2p). See STRIPE_OVERAGE.md."""
    if not plan_slug:
        return None
    slug = (plan_slug or "").lower()
    key = {
        "starter": "STRIPE_PRICE_OVERAGE_STARTER",
        "pro": "STRIPE_PRICE_OVERAGE_PRO",
        "corporate": "STRIPE_PRICE_OVERAGE_CORPORATE",
        "enterprise": "STRIPE_PRICE_OVERAGE_ENTERPRISE",
    }.get(slug)
    if slug == "enterprise" and not (os.environ.get("STRIPE_PRICE_OVERAGE_ENTERPRISE") or "").strip():
        key = "STRIPE_PRICE_OVERAGE_CORPORATE"
    if not key:
        return None
    return (os.environ.get(key) or "").strip() or None


def _report_stripe_metered_overage(org_id: str, overage_price_id: str, quantity: int) -> None:
    """POST usage_records for the metered subscription item (Stripe Billing, classic metered prices)."""
    if quantity <= 0 or not _stripe_enabled() or not stripe_secret_key:
        return
    try:
        customers = stripe.Customer.list(limit=500)
        matching = [c for c in customers.data if c.metadata.get("org_id") == org_id]
        if not matching:
            print(f"[Stripe overage] No customer for org_id={org_id}")
            return
        subs = stripe.Subscription.list(customer=matching[0].id, status="active", limit=1)
        if not subs.data:
            return
        sub = subs.data[0]
        items_obj = getattr(sub, "items", None) or sub.get("items", {}) if isinstance(sub, dict) else None
        data = getattr(items_obj, "data", None) or (items_obj.get("data", []) if isinstance(items_obj, dict) else [])
        si_id = None
        for item in data:
            price = getattr(item, "price", None) or (item.get("price") if isinstance(item, dict) else None)
            pid = getattr(price, "id", None) or (price.get("id") if isinstance(price, dict) else None)
            if pid == overage_price_id:
                si_id = getattr(item, "id", None) or item.get("id")
                break
        if not si_id:
            print(
                f"[Stripe overage] No subscription item for price {overage_price_id}. "
                f"See STRIPE_OVERAGE.md — org_id={org_id}"
            )
            return
        body = urllib.parse.urlencode(
            {
                "quantity": str(quantity),
                "action": "increment",
                "timestamp": str(int(time.time())),
            }
        ).encode()
        req = urllib.request.Request(
            f"https://api.stripe.com/v1/subscription_items/{si_id}/usage_records",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {stripe_secret_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    print(f"[Stripe overage] Unexpected status {resp.status} org_id={org_id}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode(errors="replace")
            print(f"[Stripe overage] HTTP {e.code} org_id={org_id}: {err_body[:500]}")
    except Exception as e:
        print(f"[Stripe overage] Failed org_id={org_id}: {e}")


def _org_has_active_subscription(org_id: str) -> bool:
    """True if this org has an active Stripe subscription. Uses same limit as _org_paid_plan_info."""
    if not _stripe_enabled():
        return False
    try:
        customers = stripe.Customer.list(limit=500)
        matching = [c for c in customers.data if c.metadata.get("org_id") == org_id]
        if not matching:
            return False
        subs = stripe.Subscription.list(customer=matching[0].id, status="active", limit=1)
        return len(subs.data) > 0
    except Exception:
        return False


def _org_paid_plan_info(org_id: str) -> tuple[int | None, str | None]:
    """Return (monthly_cap, plan_slug) for this org's paid plan, or (None, None) if not on a paid plan."""
    if not _stripe_enabled():
        return None, None
    try:
        customers = stripe.Customer.list(limit=500)
        matching = [c for c in customers.data if c.metadata.get("org_id") == org_id]
        if not matching:
            return None, None
        subs = stripe.Subscription.list(customer=matching[0].id, status="active", limit=1)
        if not subs.data:
            return None, None
        sub_id = getattr(subs.data[0], "id", None) or subs.data[0].get("id")
        sub = stripe.Subscription.retrieve(
            sub_id,
            expand=["items.data.price.product"],
        )
        items = getattr(sub, "items", None) or (sub.get("items") if isinstance(sub, dict) else None)
        if not items:
            return None, None
        data = getattr(items, "data", None) or (items.get("data") if isinstance(items, dict) else [])
        if not data:
            return None, None
        overage_ids = _all_overage_price_ids()
        best_cap, best_plan = None, None
        for item in data:
            price = getattr(item, "price", None) or (item.get("price") if isinstance(item, dict) else None)
            if not price:
                continue
            price_id = getattr(price, "id", None) or (price.get("id") if isinstance(price, dict) else None)
            if price_id in overage_ids:
                continue
            cap, plan = _plan_from_stripe_price(price)
            if cap is not None and plan is not None:
                if plan == "enterprise":
                    plan = "corporate"
                if best_cap is None or cap > best_cap:
                    best_cap, best_plan = cap, plan
        if best_plan == "enterprise":
            best_plan = "corporate"
        if best_cap is None:
            sm = getattr(sub, "metadata", None) or (sub.get("metadata") if isinstance(sub, dict) else None) or {}
            if hasattr(sm, "to_dict"):
                sm = sm.to_dict()  # type: ignore[assignment]
            if not isinstance(sm, dict):
                sm = {}
            cap_s = sm.get("address_cap") or sm.get("monthly_address_cap")
            if cap_s:
                try:
                    c = int(str(cap_s).replace(",", "").strip())
                    if c > 0:
                        ps = (sm.get("plan_slug") or sm.get("plan") or "enterprise").strip().lower()
                        return c, ps
                except ValueError:
                    pass
            t = _tier_from_label((sm.get("plan") or sm.get("plan_slug") or "").strip())
            if t[0] is not None:
                return t
        return best_cap, best_plan
    except Exception:
        return None, None


class CreateCheckoutRequest(BaseModel):
    org_id: str
    price_id: str
    success_url: str
    cancel_url: str


class CreatePortalRequest(BaseModel):
    org_id: str
    return_url: str


@app.post("/create-checkout-session")
def create_checkout_session(request: CreateCheckoutRequest):
    """Create a Stripe Checkout session for a subscription. Links the subscription to the Clerk org via metadata."""
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")
    try:
        # Find or create Stripe Customer for this org (Customer.list doesn't support metadata filter, so we list and filter)
        customers = stripe.Customer.list(limit=100)
        matching = [c for c in customers.data if c.metadata.get("org_id") == request.org_id]
        if matching:
            customer_id = matching[0].id
        else:
            customer = stripe.Customer.create(metadata={"org_id": request.org_id})
            customer_id = customer.id

        line_items: list[dict] = [{"price": request.price_id, "quantity": 1}]
        plan_slug = _price_id_to_plan(request.price_id)
        overage_pid = _overage_price_id_for_plan_slug(plan_slug)
        if overage_pid:
            line_items.append({"price": overage_pid})

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=line_items,
            success_url=request.success_url,
            cancel_url=request.cancel_url,
            subscription_data={"metadata": {"org_id": request.org_id}},
        )
        return {"url": session.url}
    except stripe.StripeError as e:
        msg = str(e)
        if "No such price" in msg or getattr(e, "code", None) == "resource_missing":
            detail = (
                f"{msg} "
                "Fix: (1) In smart-address-ai-main/.env.local set VITE_STRIPE_PRICE_STARTER/PRO/CORPORATE to the exact "
                "live price_ IDs from Stripe (same as address-splitter-main/.env STRIPE_PRICE_*). "
                "(2) Restart npm run dev after editing .env.local. "
                "(3) If you set STRIPE_PRICE_OVERAGE_* on the API, each must be a valid live metered price or remove bad IDs."
            )
            raise HTTPException(status_code=400, detail=detail)
        raise HTTPException(status_code=400, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Checkout failed: {str(e)}")


@app.post("/create-portal-session")
def create_portal_session(request: CreatePortalRequest):
    """Create a Stripe Customer Portal session so the billing admin can manage subscription and payment method."""
    if not _stripe_enabled():
        raise HTTPException(status_code=503, detail="Stripe is not configured.")
    try:
        customers = stripe.Customer.list(limit=100)
        matching = [c for c in customers.data if c.metadata.get("org_id") == request.org_id]
        if not matching:
            raise HTTPException(status_code=404, detail="No subscription found for this team.")
        customer_id = matching[0].id
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=request.return_url,
        )
        return {"url": portal.url}
    except stripe.StripeError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ---------- Support admin (goodwill credits) — X-Admin-Key + ADMIN_API_KEY in env ----------


def _period_utc_ym() -> str:
    return time.strftime("%Y-%m", time.gmtime())


def require_admin(x_admin_key: Annotated[str | None, Header(alias="X-Admin-Key")] = None) -> None:
    expected = (os.environ.get("ADMIN_API_KEY") or "").strip()
    if not expected or len(expected) < 32:
        raise HTTPException(
            status_code=503,
            detail="Admin API is disabled. Set ADMIN_API_KEY in the API environment (at least 32 characters).",
        )
    if not x_admin_key:
        raise HTTPException(status_code=403, detail="Missing X-Admin-Key header.")
    if not secrets.compare_digest(x_admin_key.strip().encode("utf-8"), expected.encode("utf-8")):
        raise HTTPException(status_code=403, detail="Invalid admin key.")


class AdminGrantBody(BaseModel):
    """Reduce recorded usage (goodwill). Same as refunding N billable addresses for the month."""

    org_id: str | None = None
    usage_key: str | None = None
    period: str | None = None
    reduce_tokens_used_by: int = 0
    reduce_overage_used_by: int = 0
    member_user_id: str | None = None
    reason: str = ""

    @model_validator(mode="after")
    def _need_key(self):
        if not (self.org_id or "").strip() and not (self.usage_key or "").strip():
            raise ValueError("Provide org_id (Clerk org id) or usage_key (e.g. org:org_… or user:user_…).")
        return self

    def resolved_usage_key(self) -> str:
        if (self.usage_key or "").strip():
            return self.usage_key.strip()
        return f"org:{(self.org_id or '').strip()}"


@app.get("/admin/usage/list")
def admin_usage_list(
    period: str,
    _admin: None = Depends(require_admin),
    limit: int = 200,
    offset: int = 0,
):
    """Paginated usage rows for one calendar month (UTC), e.g. period=2026-03."""
    try:
        rows = admin_list_usage_for_period(period, limit=limit, offset=offset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"period": period, "limit": limit, "offset": offset, "rows": rows}


@app.get("/admin/usage/lookup")
def admin_usage_lookup(
    usage_key: str,
    _admin: None = Depends(require_admin),
    period: str | None = None,
):
    p = (period or "").strip() or _period_utc_ym()
    try:
        row = admin_get_usage_row(usage_key, p)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not row:
        raise HTTPException(status_code=404, detail="No usage row for this key/period.")
    out: dict = {"usage": row}
    if usage_key.strip().startswith("org:"):
        oid = usage_key.strip()[4:]
        if _stripe_enabled():
            cap, slug = _org_paid_plan_info(oid)
            out["stripe"] = {
                "has_active_subscription": _org_has_active_subscription(oid),
                "plan_cap": cap,
                "plan_slug": slug,
            }
        else:
            out["stripe"] = {"configured": False}
    return out


@app.post("/admin/usage/grant")
def admin_usage_grant(body: AdminGrantBody, _admin: None = Depends(require_admin)):
    p = (body.period or "").strip() or _period_utc_ym()
    try:
        result = admin_grant_goodwill(
            body.resolved_usage_key(),
            p,
            body.reduce_tokens_used_by,
            body.reduce_overage_used_by,
            body.reason,
            member_user_id=body.member_user_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, "grant": result}


@app.get("/admin/audit")
def admin_audit_list(_admin: None = Depends(require_admin), limit: int = 100, offset: int = 0):
    return {"entries": admin_list_audit(limit=limit, offset=offset)}


@app.get("/admin/health")
def admin_health(_admin: None = Depends(require_admin)):
    return {"admin": True, "usage_db": (os.environ.get("USAGE_DB_PATH") or "default usage.db beside parse_api.py")}

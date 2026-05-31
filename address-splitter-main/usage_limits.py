"""
Usage and rate limiting for Smart Address UK.
- Anonymous: 1 address per request, per-IP rate limit (e.g. 10/min).
- Signed-in free tier: 50 addresses/month per org (or per user if no org); optional overage up to overage_limit.
- Paid: no token limit (handled by Stripe).
"""
import os
import sqlite3
import time
from collections import defaultdict
from dataclasses import dataclass
from threading import Lock

# -------- Constants --------
FREE_MONTHLY_TOKENS = 50
# Anonymous (signed-out) requests should stay small to prevent abuse.
ANONYMOUS_MAX_ADDRESSES = int(os.environ.get("ANONYMOUS_MAX_ADDRESSES", "1"))
# Signed-in requests can be larger (still bounded for CPU/memory and UX).
MAX_ADDRESSES_PER_REQUEST = int(os.environ.get("MAX_ADDRESSES_PER_REQUEST", "10000"))
ANONYMOUS_RATE_LIMIT_REQUESTS = 10
ANONYMOUS_RATE_LIMIT_WINDOW_SEC = 60

# -------- SQLite usage store --------
USAGE_DB_PATH = os.environ.get("USAGE_DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "usage.db"))
_db_lock = Lock()


def _get_conn():
    conn = sqlite3.connect(USAGE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usage (
                    key TEXT NOT NULL,
                    period TEXT NOT NULL,
                    tokens_used INTEGER NOT NULL DEFAULT 0,
                    overage_used INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (key, period)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS org_settings (
                    org_id TEXT NOT NULL PRIMARY KEY,
                    overage_limit INTEGER NULL
                )
            """)
            # Migration: add allow_all_see_usage if missing (existing DBs)
            info = conn.execute("PRAGMA table_info(org_settings)").fetchall()
            cols = [r[1] for r in info]
            if "allow_all_see_usage" not in cols:
                conn.execute("ALTER TABLE org_settings ADD COLUMN allow_all_see_usage INTEGER NOT NULL DEFAULT 1")
            if "paid_monthly_overage_max" not in cols:
                conn.execute(
                    "ALTER TABLE org_settings ADD COLUMN paid_monthly_overage_max INTEGER NULL"
                )
            info = conn.execute("PRAGMA table_info(org_settings)").fetchall()
            cols = [r[1] for r in info]
            if "billing_period_start" not in cols:
                conn.execute("ALTER TABLE org_settings ADD COLUMN billing_period_start INTEGER NULL")
            if "billing_period_end" not in cols:
                conn.execute("ALTER TABLE org_settings ADD COLUMN billing_period_end INTEGER NULL")
            conn.commit()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS member_settings (
                    org_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    can_see_usage INTEGER NOT NULL DEFAULT 1,
                    personal_limit INTEGER NULL,
                    PRIMARY KEY (org_id, user_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_by_member (
                    org_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    period TEXT NOT NULL,
                    tokens_used INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (org_id, user_id, period)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_at TEXT NOT NULL,
                    action TEXT NOT NULL,
                    usage_key TEXT NOT NULL,
                    period TEXT NOT NULL,
                    before_tokens INTEGER NOT NULL,
                    before_overage INTEGER NOT NULL,
                    after_tokens INTEGER NOT NULL,
                    after_overage INTEGER NOT NULL,
                    reduce_tokens INTEGER NOT NULL,
                    reduce_overage INTEGER NOT NULL,
                    member_user_id TEXT NULL,
                    reason TEXT NOT NULL
                )
            """)
            conn.commit()
        finally:
            conn.close()


def _period_now() -> str:
    """Current calendar month YYYY-MM (UTC). Used for free tier."""
    return time.strftime("%Y-%m", time.gmtime())


def _stripe_period_key(period_start: int, period_end: int) -> str:
    return f"stripe:{period_start}:{period_end}"


def sync_org_billing_period(org_id: str, period_start: int, period_end: int) -> None:
    """Cache Stripe subscription current_period_* for usage bucketing (paid teams)."""
    if not org_id or period_end <= period_start:
        return
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO org_settings (org_id, overage_limit, allow_all_see_usage, paid_monthly_overage_max,
                    billing_period_start, billing_period_end)
                VALUES (?, NULL, 1, NULL, ?, ?)
                ON CONFLICT(org_id) DO UPDATE SET
                    billing_period_start = excluded.billing_period_start,
                    billing_period_end = excluded.billing_period_end
                """,
                (org_id, int(period_start), int(period_end)),
            )
            conn.commit()
        finally:
            conn.close()


def clear_org_billing_period(org_id: str) -> None:
    """Drop cached billing period when subscription ends (revert to calendar-month free tier)."""
    if not org_id:
        return
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                UPDATE org_settings
                SET billing_period_start = NULL, billing_period_end = NULL
                WHERE org_id = ?
                """,
                (org_id,),
            )
            conn.commit()
        finally:
            conn.close()


def get_org_billing_period(org_id: str | None) -> tuple[int, int] | None:
    """Return (start, end) unix timestamps for the org's Stripe billing period, if cached."""
    if not org_id:
        return None
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT billing_period_start, billing_period_end FROM org_settings WHERE org_id = ?",
                (org_id,),
            ).fetchone()
            if not row or row["billing_period_start"] is None or row["billing_period_end"] is None:
                return None
            start = int(row["billing_period_start"])
            end = int(row["billing_period_end"])
            if end <= start:
                return None
            return start, end
        finally:
            conn.close()


def _usage_period(org_id: str | None, user_id: str) -> str:
    """
    Usage bucket id: paid orgs use Stripe subscription period (synced from parse_api);
    free / personal use UTC calendar month.
    """
    if org_id:
        cached = get_org_billing_period(org_id)
        if cached:
            start, end = cached
            now = int(time.time())
            if start <= now < end:
                return _stripe_period_key(start, end)
    return _period_now()


def _usage_key(org_id: str | None, user_id: str) -> str:
    """Single key for usage: org if present, else user (personal)."""
    if org_id:
        return f"org:{org_id}"
    return f"user:{user_id}"


def migrate_personal_usage_to_org(user_id: str, org_id: str) -> None:
    """
    When a user gets their first workspace org, move this month's free-tier counters
    from user:* to org:* so credits don't reset (same bucket, new key).
    """
    _init_db()
    period = _usage_period(org_id, user_id)
    user_key = f"user:{user_id}"
    org_key = f"org:{org_id}"
    with _db_lock:
        conn = _get_conn()
        try:
            urow = conn.execute(
                "SELECT tokens_used, overage_used FROM usage WHERE key = ? AND period = ?",
                (user_key, period),
            ).fetchone()
            if not urow:
                conn.commit()
                return
            u_tok = int(urow["tokens_used"])
            u_ovg = int(urow["overage_used"])
            orow = conn.execute(
                "SELECT tokens_used, overage_used FROM usage WHERE key = ? AND period = ?",
                (org_key, period),
            ).fetchone()
            if orow:
                o_tok = int(orow["tokens_used"])
                o_ovg = int(orow["overage_used"])
                final_tok = u_tok + o_tok
                final_ovg = u_ovg + o_ovg
            else:
                final_tok, final_ovg = u_tok, u_ovg
            conn.execute(
                """
                INSERT INTO usage (key, period, tokens_used, overage_used)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key, period) DO UPDATE SET
                    tokens_used = excluded.tokens_used,
                    overage_used = excluded.overage_used
                """,
                (org_key, period, final_tok, final_ovg),
            )
            conn.execute("DELETE FROM usage WHERE key = ? AND period = ?", (user_key, period))
            conn.commit()
        finally:
            conn.close()


def get_usage(org_id: str | None, user_id: str) -> tuple[int, int, int | None]:
    """
    Returns (tokens_used, overage_used, overage_limit) for current period.
    overage_limit is None if not set.
    """
    _init_db()
    key = _usage_key(org_id, user_id)
    period = _usage_period(org_id, user_id)
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT tokens_used, overage_used FROM usage WHERE key = ? AND period = ?",
                (key, period),
            ).fetchone()
            tokens_used = int(row["tokens_used"]) if row else 0
            overage_used = int(row["overage_used"]) if row else 0
            limit_row = None
            if org_id:
                limit_row = conn.execute(
                    "SELECT overage_limit FROM org_settings WHERE org_id = ?",
                    (org_id,),
                ).fetchone()
            overage_limit = int(limit_row["overage_limit"]) if limit_row and limit_row["overage_limit"] is not None else None
            return (tokens_used, overage_used, overage_limit)
        finally:
            conn.close()


def consume_tokens(org_id: str | None, user_id: str, count: int) -> str | None:
    """
    Free tier only: hard cap at FREE_MONTHLY_TOKENS, no overage allowed.
    Returns None on success, or an error message string.
    """
    _init_db()
    key = _usage_key(org_id, user_id)
    period = _usage_period(org_id, user_id)
    tokens_used, overage_used, _ = get_usage(org_id, user_id)
    remaining_free = max(0, FREE_MONTHLY_TOKENS - tokens_used)
    if count > remaining_free:
        return (
            f"Free tier: {FREE_MONTHLY_TOKENS} tokens/month. "
            f"You've used {tokens_used}. Upgrade to a paid plan for more."
        )
    new_tokens = tokens_used + count
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO usage (key, period, tokens_used, overage_used)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key, period) DO UPDATE SET
                    tokens_used = excluded.tokens_used,
                    overage_used = excluded.overage_used
                """,
                (key, period, new_tokens, overage_used),
            )
            conn.commit()
        finally:
            conn.close()
    return None


def set_overage_limit(org_id: str, limit: int | None) -> None:
    """Set overage limit for a free-tier org. None = no overage allowed."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO org_settings (org_id, overage_limit)
                VALUES (?, ?)
                ON CONFLICT(org_id) DO UPDATE SET overage_limit = excluded.overage_limit
                """,
                (org_id, limit),
            )
            conn.commit()
        finally:
            conn.close()


def get_overage_limit(org_id: str) -> int | None:
    """Return overage_limit for org, or None if not set."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT overage_limit FROM org_settings WHERE org_id = ?",
                (org_id,),
            ).fetchone()
            return int(row["overage_limit"]) if row and row["overage_limit"] is not None else None
        finally:
            conn.close()


def get_org_settings(org_id: str) -> dict:
    """Return overage_limit, allow_all_see_usage, paid_monthly_overage_max for org."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT overage_limit, allow_all_see_usage, paid_monthly_overage_max FROM org_settings WHERE org_id = ?",
                (org_id,),
            ).fetchone()
            if not row:
                return {
                    "overage_limit": None,
                    "allow_all_see_usage": True,
                    "paid_monthly_overage_max": None,
                }
            paid_max = row["paid_monthly_overage_max"]
            return {
                "overage_limit": int(row["overage_limit"]) if row["overage_limit"] is not None else None,
                "allow_all_see_usage": bool(row["allow_all_see_usage"]) if len(row.keys()) > 1 and row["allow_all_see_usage"] is not None else True,
                "paid_monthly_overage_max": int(paid_max) if paid_max is not None else None,
            }
        except (sqlite3.OperationalError, KeyError, TypeError):
            return {
                "overage_limit": get_overage_limit(org_id),
                "allow_all_see_usage": True,
                "paid_monthly_overage_max": None,
            }
        finally:
            conn.close()


def set_org_settings(org_id: str, overage_limit: int | None = None, allow_all_see_usage: bool | None = None) -> None:
    """Update org settings. Pass only fields to update."""
    _init_db()
    current = get_org_settings(org_id)
    olimit = overage_limit if overage_limit is not None else current["overage_limit"]
    osee = allow_all_see_usage if allow_all_see_usage is not None else current["allow_all_see_usage"]
    paid_m = current.get("paid_monthly_overage_max")
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO org_settings (org_id, overage_limit, allow_all_see_usage, paid_monthly_overage_max)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(org_id) DO UPDATE SET
                    overage_limit = excluded.overage_limit,
                    allow_all_see_usage = excluded.allow_all_see_usage
                """,
                (org_id, olimit, 1 if osee else 0, paid_m),
            )
            conn.commit()
        finally:
            conn.close()


def get_member_settings(org_id: str, user_id: str) -> tuple[bool, int | None]:
    """Return (can_see_usage, personal_limit) for member. Defaults (True, None)."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT can_see_usage, personal_limit FROM member_settings WHERE org_id = ? AND user_id = ?",
                (org_id, user_id),
            ).fetchone()
            if not row:
                return True, None
            return bool(row["can_see_usage"]), int(row["personal_limit"]) if row["personal_limit"] is not None else None
        finally:
            conn.close()


def set_member_settings(org_id: str, user_id: str, can_see_usage: bool | None = None, personal_limit: int | None = None) -> None:
    """Update member settings. Pass only fields to update."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute("SELECT can_see_usage, personal_limit FROM member_settings WHERE org_id = ? AND user_id = ?", (org_id, user_id)).fetchone()
            if row:
                csee = can_see_usage if can_see_usage is not None else bool(row["can_see_usage"])
                plim = personal_limit if personal_limit is not None else (int(row["personal_limit"]) if row["personal_limit"] is not None else None)
            else:
                csee = can_see_usage if can_see_usage is not None else True
                plim = personal_limit
            conn.execute(
                """
                INSERT INTO member_settings (org_id, user_id, can_see_usage, personal_limit)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(org_id, user_id) DO UPDATE SET
                    can_see_usage = excluded.can_see_usage,
                    personal_limit = excluded.personal_limit
                """,
                (org_id, user_id, 1 if csee else 0, plim),
            )
            conn.commit()
        finally:
            conn.close()


def get_member_usage(org_id: str, user_id: str) -> int:
    """Return tokens_used for this member in the org for current period."""
    _init_db()
    period = _usage_period(org_id, user_id)
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT tokens_used FROM usage_by_member WHERE org_id = ? AND user_id = ? AND period = ?",
                (org_id, user_id, period),
            ).fetchone()
            return int(row["tokens_used"]) if row else 0
        finally:
            conn.close()


def get_members_usage(org_id: str) -> list[tuple[str, int]]:
    """Return list of (user_id, tokens_used) for current period for this org."""
    _init_db()
    period = _usage_period(org_id, "unused")
    with _db_lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                "SELECT user_id, tokens_used FROM usage_by_member WHERE org_id = ? AND period = ?",
                (org_id, period),
            ).fetchall()
            return [(r["user_id"], int(r["tokens_used"])) for r in rows]
        finally:
            conn.close()


def get_paid_monthly_overage_max(org_id: str) -> int | None:
    """
    Max billable addresses beyond plan included allowance per month (paid teams).
    None = unlimited metered overage; 0 = no overage beyond included; N = cap at N extra.
    """
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT paid_monthly_overage_max FROM org_settings WHERE org_id = ?",
                (org_id,),
            ).fetchone()
            if not row or row["paid_monthly_overage_max"] is None:
                return None
            return int(row["paid_monthly_overage_max"])
        except (sqlite3.OperationalError, KeyError, TypeError):
            return None
        finally:
            conn.close()


def set_paid_monthly_overage_max(org_id: str, max_extra: int | None) -> None:
    """None = unlimited (NULL in DB). Non-negative int = max extra addresses/month beyond plan."""
    _init_db()
    with _db_lock:
        conn = _get_conn()
        try:
            cur = conn.execute(
                "UPDATE org_settings SET paid_monthly_overage_max = ? WHERE org_id = ?",
                (max_extra, org_id),
            )
            if cur.rowcount == 0:
                conn.execute(
                    """
                    INSERT INTO org_settings (org_id, overage_limit, allow_all_see_usage, paid_monthly_overage_max)
                    VALUES (?, NULL, 1, ?)
                    """,
                    (org_id, max_extra),
                )
            conn.commit()
        finally:
            conn.close()


def consume_tokens_paid(
    org_id: str,
    count: int,
    monthly_cap: int,
    user_id: str | None = None,
    *,
    allow_overage: bool = False,
    paid_overage_max: int | None = None,
) -> tuple[str | None, int]:
    """
    For paid orgs: record address usage. Included addresses count toward monthly_cap;
    beyond that, each unit is overage (when allow_overage is True).

    paid_overage_max: None = no cap on metered overage; int = max cumulative overage this month.

    Returns (error_message_or_None, overage_units_in_this_batch).
    When allow_overage is False and the batch would exceed the cap, returns an error.
    """
    if count <= 0:
        return (None, 0)
    _init_db()
    key = f"org:{org_id}"
    period = _usage_period(org_id, user_id or "unused")
    tokens_used, overage_used_row, _ = get_usage(org_id, user_id or "unused")
    overage_this_batch = max(0, tokens_used + count - monthly_cap) - max(0, tokens_used - monthly_cap)

    if paid_overage_max is not None and overage_this_batch > 0:
        if overage_used_row + overage_this_batch > paid_overage_max:
            return (
                (
                    f"You've used {overage_used_row} of {paid_overage_max} allowed overage addresses this billing period "
                    f"(beyond your {monthly_cap:,} included). Increase the cap in Team settings or wait until your plan renews."
                ),
                0,
            )

    if tokens_used + count > monthly_cap and not allow_overage:
        return (
            (
                f"You've used {tokens_used} of {monthly_cap} addresses this billing period. "
                f"Upgrade your plan or wait until your subscription renews for more."
            ),
            0,
        )
    if user_id:
        _, personal_limit = get_member_settings(org_id, user_id)
        if personal_limit is not None:
            member_used = get_member_usage(org_id, user_id)
            if member_used + count > personal_limit:
                return (
                    (
                        f"Your personal limit is {personal_limit} addresses this billing period. "
                        f"You've used {member_used}. Ask your team admin to increase it."
                    ),
                    0,
                )
    new_tokens = tokens_used + count
    new_overage_total = overage_used_row + overage_this_batch
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO usage (key, period, tokens_used, overage_used)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key, period) DO UPDATE SET
                    tokens_used = excluded.tokens_used,
                    overage_used = excluded.overage_used
                """,
                (key, period, new_tokens, new_overage_total),
            )
            if user_id:
                row = conn.execute(
                    "SELECT tokens_used FROM usage_by_member WHERE org_id = ? AND user_id = ? AND period = ?",
                    (org_id, user_id, period),
                ).fetchone()
                member_used = int(row["tokens_used"]) if row else 0
                new_member = member_used + count
                conn.execute(
                    """
                    INSERT INTO usage_by_member (org_id, user_id, period, tokens_used)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(org_id, user_id, period) DO UPDATE SET tokens_used = excluded.tokens_used
                    """,
                    (org_id, user_id, period, new_member),
                )
            conn.commit()
        finally:
            conn.close()
    return (None, overage_this_batch)


def refund_tokens(org_id: str | None, user_id: str, refund: int) -> None:
    """
    Put back free-tier + overage credits (e.g. addresses that were parsed but could not be split).
    Reverses consume_tokens order: reduce overage_used first, then tokens_used.
    """
    if refund <= 0:
        return
    _init_db()
    tokens_used, overage_used, _ = get_usage(org_id, user_id)
    take_ov = min(refund, overage_used)
    new_overage = overage_used - take_ov
    refund_left = refund - take_ov
    new_tokens = max(0, tokens_used - refund_left)
    key = _usage_key(org_id, user_id)
    period = _usage_period(org_id, user_id)
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                """
                INSERT INTO usage (key, period, tokens_used, overage_used)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key, period) DO UPDATE SET
                    tokens_used = excluded.tokens_used,
                    overage_used = excluded.overage_used
                """,
                (key, period, new_tokens, new_overage),
            )
            conn.commit()
        finally:
            conn.close()


def refund_tokens_paid(org_id: str, refund: int, user_id: str | None = None) -> None:
    """Restore paid-org monthly usage after failed splits."""
    if refund <= 0:
        return
    _init_db()
    key = f"org:{org_id}"
    period = _usage_period(org_id, user_id or "unused")
    tokens_used, _, _ = get_usage(org_id, user_id or "unused")
    new_org = max(0, tokens_used - refund)
    with _db_lock:
        conn = _get_conn()
        try:
            conn.execute(
                "UPDATE usage SET tokens_used = ? WHERE key = ? AND period = ?",
                (new_org, key, period),
            )
            if user_id:
                row = conn.execute(
                    "SELECT tokens_used FROM usage_by_member WHERE org_id = ? AND user_id = ? AND period = ?",
                    (org_id, user_id, period),
                ).fetchone()
                if row:
                    mu = int(row["tokens_used"])
                    conn.execute(
                        "UPDATE usage_by_member SET tokens_used = ? WHERE org_id = ? AND user_id = ? AND period = ?",
                        (max(0, mu - refund), org_id, user_id, period),
                    )
            conn.commit()
        finally:
            conn.close()


# -------- Support: audited goodwill (reduce recorded usage) --------
def _validate_usage_key(usage_key: str) -> str:
    k = (usage_key or "").strip()
    if not k or " " in k:
        raise ValueError("Invalid usage_key.")
    if not (k.startswith("org:") or k.startswith("user:")):
        raise ValueError("usage_key must start with org: or user: (e.g. org:org_2abc…).")
    return k


def _validate_period(period: str) -> str:
    p = (period or "").strip()
    if len(p) != 7 or p[4] != "-":
        raise ValueError("period must be YYYY-MM (UTC calendar month).")
    y, m = p[:4], p[5:7]
    if not y.isdigit() or not m.isdigit() or not (1 <= int(m) <= 12):
        raise ValueError("period must be YYYY-MM (UTC calendar month).")
    return p


def admin_list_usage_for_period(period: str, *, limit: int = 200, offset: int = 0) -> list[dict]:
    """Rows from usage for support review (newest keys first within page)."""
    _init_db()
    p = _validate_period(period)
    lim = max(1, min(limit, 500))
    off = max(0, offset)
    with _db_lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                """
                SELECT key, period, tokens_used, overage_used
                FROM usage
                WHERE period = ?
                ORDER BY key ASC
                LIMIT ? OFFSET ?
                """,
                (p, lim, off),
            ).fetchall()
            return [
                {
                    "key": r["key"],
                    "period": r["period"],
                    "tokens_used": int(r["tokens_used"]),
                    "overage_used": int(r["overage_used"]),
                }
                for r in rows
            ]
        finally:
            conn.close()


def admin_get_usage_row(usage_key: str, period: str) -> dict | None:
    _init_db()
    k = _validate_usage_key(usage_key)
    p = _validate_period(period)
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT key, period, tokens_used, overage_used FROM usage WHERE key = ? AND period = ?",
                (k, p),
            ).fetchone()
            if not row:
                return None
            return {
                "key": row["key"],
                "period": row["period"],
                "tokens_used": int(row["tokens_used"]),
                "overage_used": int(row["overage_used"]),
            }
        finally:
            conn.close()


def admin_list_audit(*, limit: int = 100, offset: int = 0) -> list[dict]:
    _init_db()
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with _db_lock:
        conn = _get_conn()
        try:
            rows = conn.execute(
                """
                SELECT id, created_at, action, usage_key, period,
                       before_tokens, before_overage, after_tokens, after_overage,
                       reduce_tokens, reduce_overage, member_user_id, reason
                FROM admin_audit_log
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                (lim, off),
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()


def admin_grant_goodwill(
    usage_key: str,
    period: str,
    reduce_tokens_used_by: int,
    reduce_overage_used_by: int,
    reason: str,
    *,
    member_user_id: str | None = None,
) -> dict:
    """
    Reduce recorded usage for customer service (same effect as refunding N addresses).
    At least one reduction must be > 0. Writes admin_audit_log.
    """
    _init_db()
    k = _validate_usage_key(usage_key)
    p = _validate_period(period)
    rt = int(reduce_tokens_used_by)
    ro = int(reduce_overage_used_by)
    rsn = (reason or "").strip()
    if rt < 0 or ro < 0:
        raise ValueError("Reduction amounts must be non-negative.")
    if rt == 0 and ro == 0:
        raise ValueError("Specify reduce_tokens_used_by and/or reduce_overage_used_by > 0.")
    if len(rsn) < 4:
        raise ValueError("reason must be at least 4 characters (support ticket / note).")

    mem = (member_user_id or "").strip() or None
    if mem and not k.startswith("org:"):
        raise ValueError("member_user_id is only valid with an org: usage_key.")

    created = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    with _db_lock:
        conn = _get_conn()
        try:
            row = conn.execute(
                "SELECT tokens_used, overage_used FROM usage WHERE key = ? AND period = ?",
                (k, p),
            ).fetchone()
            before_t = int(row["tokens_used"]) if row else 0
            before_o = int(row["overage_used"]) if row else 0

            dec_t = min(rt, before_t)
            dec_o = min(ro, before_o)
            after_t = before_t - dec_t
            after_o = before_o - dec_o

            conn.execute(
                """
                INSERT INTO usage (key, period, tokens_used, overage_used)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key, period) DO UPDATE SET
                    tokens_used = excluded.tokens_used,
                    overage_used = excluded.overage_used
                """,
                (k, p, after_t, after_o),
            )

            if mem:
                org_id = k[4:]
                mrow = conn.execute(
                    "SELECT tokens_used FROM usage_by_member WHERE org_id = ? AND user_id = ? AND period = ?",
                    (org_id, mem, p),
                ).fetchone()
                if mrow:
                    mu = int(mrow["tokens_used"])
                    conn.execute(
                        """
                        UPDATE usage_by_member SET tokens_used = ?
                        WHERE org_id = ? AND user_id = ? AND period = ?
                        """,
                        (max(0, mu - min(rt, mu)), org_id, mem, p),
                    )

            conn.execute(
                """
                INSERT INTO admin_audit_log (
                    created_at, action, usage_key, period,
                    before_tokens, before_overage, after_tokens, after_overage,
                    reduce_tokens, reduce_overage, member_user_id, reason
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    created,
                    "grant_goodwill",
                    k,
                    p,
                    before_t,
                    before_o,
                    after_t,
                    after_o,
                    dec_t,
                    dec_o,
                    mem,
                    rsn,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    return {
        "usage_key": k,
        "period": p,
        "before_tokens_used": before_t,
        "before_overage_used": before_o,
        "after_tokens_used": after_t,
        "after_overage_used": after_o,
        "applied_reduce_tokens": dec_t,
        "applied_reduce_overage": dec_o,
        "member_user_id": mem,
    }


# -------- Anonymous rate limit (in-memory, per IP) --------
_anon_counts: dict[str, list[float]] = defaultdict(list)
_anon_lock = Lock()


def check_anonymous_rate_limit(client_ip: str) -> str | None:
    """
    Sliding window: allow ANONYMOUS_RATE_LIMIT_REQUESTS per ANONYMOUS_RATE_LIMIT_WINDOW_SEC.
    Returns None if allowed, or an error message.
    """
    now = time.time()
    cutoff = now - ANONYMOUS_RATE_LIMIT_WINDOW_SEC
    with _anon_lock:
        times = _anon_counts[client_ip]
        times[:] = [t for t in times if t > cutoff]
        if len(times) >= ANONYMOUS_RATE_LIMIT_REQUESTS:
            return "Too many requests. Sign in for more, or try again in a minute."
        times.append(now)
    return None


# -------- Signed-in parse rate limit (abuse: junk / spam requests) --------
_signed_in_parse_counts: dict[str, list[float]] = defaultdict(list)
_signed_in_parse_lock = Lock()
SIGNED_IN_PARSE_RATE_LIMIT_REQUESTS = int(os.environ.get("SIGNED_IN_PARSE_RATE_LIMIT_REQUESTS", "45"))
SIGNED_IN_PARSE_RATE_LIMIT_WINDOW_SEC = int(os.environ.get("SIGNED_IN_PARSE_RATE_LIMIT_WINDOW_SEC", "60"))


def check_signed_in_parse_rate_limit(rate_key: str) -> str | None:
    """
    Per org+user (or personal user) sliding window on /parse.
    Stops rapid-fire abuse without burning credits.
    """
    now = time.time()
    cutoff = now - SIGNED_IN_PARSE_RATE_LIMIT_WINDOW_SEC
    with _signed_in_parse_lock:
        times = _signed_in_parse_counts[rate_key]
        times[:] = [t for t in times if t > cutoff]
        if len(times) >= SIGNED_IN_PARSE_RATE_LIMIT_REQUESTS:
            return (
                f"Too many split requests. Try again in {SIGNED_IN_PARSE_RATE_LIMIT_WINDOW_SEC // 60 or 1} minute(s)."
            )
        times.append(now)
    return None

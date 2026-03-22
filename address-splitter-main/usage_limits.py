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
ANONYMOUS_MAX_ADDRESSES = 1
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
            conn.commit()
        finally:
            conn.close()


def _period_now() -> str:
    """Current calendar month YYYY-MM."""
    return time.strftime("%Y-%m", time.gmtime())


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
    period = _period_now()
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
    period = _period_now()
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
    period = _period_now()
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
    period = _period_now()
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
    period = _period_now()
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
    period = _period_now()
    tokens_used, overage_used_row, _ = get_usage(org_id, "unused")
    overage_this_batch = max(0, tokens_used + count - monthly_cap) - max(0, tokens_used - monthly_cap)

    if paid_overage_max is not None and overage_this_batch > 0:
        if overage_used_row + overage_this_batch > paid_overage_max:
            return (
                (
                    f"You've used {overage_used_row} of {paid_overage_max} allowed overage addresses this month "
                    f"(beyond your {monthly_cap:,} included). Increase the cap in Team settings or wait until next month."
                ),
                0,
            )

    if tokens_used + count > monthly_cap and not allow_overage:
        return (
            (
                f"You've used {tokens_used} of {monthly_cap} addresses this month. "
                f"Upgrade your plan or wait until next month for more."
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
                        f"Your personal limit is {personal_limit} addresses this month. "
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
    period = _period_now()
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
    period = _period_now()
    tokens_used, _, _ = get_usage(org_id, "unused")
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

import type { ParsedAddress } from "./addressParser";

const getApiBase = () => {
  const env = import.meta.env.VITE_PARSER_API_URL;
  if (env && typeof env === "string") return env.replace(/\/$/, "");
  return ""; // same origin; use Vite proxy /api in dev
};

export type ParseApiOptions = {
  /** Clerk session token for signed-in usage (token limits / paid). */
  token?: string | null;
  /** Current org id when signed in (for usage and overage). */
  orgId?: string | null;
};

export type UnsplitEntry = { line: number; address: string };

/**
 * Parse addresses via the Python backend.
 * Anonymous: 1 address, rate limited. Signed-in: token/overage limits apply.
 * Returns results (one row per input; blank row if address could not be split) and unsplit list for manual intervention.
 */
export async function parseAddressesApi(
  addresses: string[],
  options: ParseApiOptions = {}
): Promise<{ results: ParsedAddress[]; unsplit: UnsplitEntry[]; fromApi: boolean }> {
  const base = getApiBase();
  const url = base ? `${base}/parse` : "/api/parse";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.orgId) headers["X-Org-Id"] = options.orgId;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = res.statusText;
    try {
      const err = JSON.parse(text);
      if (err && typeof err.detail === "string") detail = err.detail;
    } catch {
      if (text.length > 0 && text.length < 200) detail = text;
    }
    if (res.status === 429) throw new Error(detail || "Too many requests. Try again in a minute or sign in.");
    if (res.status === 402) throw new Error(detail || "Out of tokens. Set an overage limit or upgrade your plan.");
    throw new Error(detail || `Parser API error: ${res.status}`);
  }
  const data = (await res.json()) as { results: ParsedAddress[]; unsplit?: UnsplitEntry[] };
  return {
    results: data.results,
    unsplit: Array.isArray(data.unsplit) ? data.unsplit : [],
    fromApi: true,
  };
}

/** Debug: what does the backend see for this token? Same URL base as parse. */
export async function whoami(options: { token: string | null; orgId?: string | null }): Promise<{
  auth_header_present: boolean;
  has_bearer_token: boolean;
  user_id: string | null;
  org_id_from_header: string | null;
  verify_reason: string;
  hint: string;
}> {
  const base = getApiBase();
  const url = base ? `${base}/whoami` : "/api/whoami";
  const headers: Record<string, string> = {};
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.orgId) headers["X-Org-Id"] = options.orgId;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("whoami failed");
  return res.json();
}

/** Debug: what would the backend use for /parse? Same headers. Use to verify org and cap. */
export async function fetchParseContext(options: { token: string; orgId?: string | null }): Promise<{
  org_id_from_header: string | null;
  user_id?: string;
  error?: string;
  has_active_subscription?: boolean;
  plan_cap?: number | null;
  plan_slug?: string | null;
  tokens_used?: number;
  tokens_limit?: number;
  would_enforce_cap?: boolean;
}> {
  const base = getApiBase();
  const url = base ? `${base}/parse-context` : "/api/parse-context";
  const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` };
  if (options.orgId) headers["X-Org-Id"] = options.orgId;
  const res = await fetch(url, { headers });
  if (!res.ok) return { org_id_from_header: options.orgId ?? null, error: "Request failed" };
  return res.json();
}

/**
 * Sync workspace with the backend: resolves the user's existing Clerk org (does not create orgs —
 * Clerk enrollment does). Migrates personal free-tier SQLite usage into that org when needed.
 */
export async function ensureWorkspace(options: { token: string }): Promise<{
  org_id: string;
  name: string;
  created: boolean;
}> {
  const base = getApiBase();
  const url = base ? `${base}/team/ensure-workspace` : "/api/team/ensure-workspace";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : "Could not set up workspace.");
  }
  return res.json();
}

/** Fetch current usage (tokens used, limit, overage, plan). Requires token; pass orgId for team, omit for personal. */
export async function fetchUsage(options: { token: string; orgId?: string | null }): Promise<{
  tokens_used: number;
  tokens_limit: number;
  overage_used: number;
  overage_limit: number | null;
  plan: string;
  paid_overage_billing_enabled?: boolean;
}> {
  const base = getApiBase();
  const url = base ? `${base}/usage` : "/api/usage";
  const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` };
  if (options.orgId) headers["X-Org-Id"] = options.orgId;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("Failed to load usage.");
  return res.json();
}

/** Set overage limit for free-tier org. */
export async function setOverageLimit(options: {
  token: string;
  orgId: string;
  overageLimit: number | null;
}): Promise<{ overage_limit: number | null }> {
  const base = getApiBase();
  const url = base ? `${base}/settings/overage-limit` : "/api/settings/overage-limit";
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
      "X-Org-Id": options.orgId,
    },
    body: JSON.stringify({ overage_limit: options.overageLimit }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update overage limit.");
  }
  return res.json();
}

/** Team settings and current user context (usage, is_admin, permissions). */
export async function fetchTeamSettings(options: { token: string; orgId: string }): Promise<{
  org_settings: {
    overage_limit: number | null;
    paid_monthly_overage_max: number | null;
    allow_all_see_usage: boolean;
  };
  is_admin: boolean;
  tokens_used: number;
  tokens_limit: number;
  overage_used: number;
  overage_limit: number | null;
  plan: string;
  can_see_usage: boolean;
  personal_limit: number | null;
  paid_overage_billing_enabled?: boolean;
  /** Stripe has an active subscription for this org */
  has_active_subscription?: boolean;
  /** Org admins must cancel the subscription before leaving (members may leave). */
  must_cancel_subscription_before_leave?: boolean;
}> {
  const base = getApiBase();
  const url = base ? `${base}/team/settings` : "/api/team/settings";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${options.token}`, "X-Org-Id": options.orgId },
  });
  if (!res.ok) throw new Error("Failed to load team settings.");
  return res.json();
}

/** Update org settings. Admin only. paid_monthly_overage_max: null = unlimited metered (paid teams). */
export async function updateTeamSettings(options: {
  token: string;
  orgId: string;
  overage_limit?: number | null;
  paid_monthly_overage_max?: number | null;
  allow_all_see_usage?: boolean;
}): Promise<ReturnType<typeof fetchTeamSettings>> {
  const base = getApiBase();
  const url = base ? `${base}/team/settings` : "/api/team/settings";
  const patch: Record<string, unknown> = {};
  if (options.overage_limit !== undefined) patch.overage_limit = options.overage_limit;
  if (options.paid_monthly_overage_max !== undefined) patch.paid_monthly_overage_max = options.paid_monthly_overage_max;
  if (options.allow_all_see_usage !== undefined) patch.allow_all_see_usage = options.allow_all_see_usage;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
      "X-Org-Id": options.orgId,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update settings.");
  }
  return res.json();
}

export type TeamMember = {
  user_id: string;
  role: string;
  first_name: string;
  last_name: string;
  /** Primary email from Clerk (for display when name is empty). */
  email: string;
  tokens_used: number;
  can_see_usage: boolean;
  personal_limit: number | null;
  paid_overage_billing_enabled?: boolean;
};

/** Team members with usage and permissions. */
export async function fetchTeamMembers(options: { token: string; orgId: string }): Promise<{
  members: TeamMember[];
  is_admin: boolean;
}> {
  const base = getApiBase();
  const url = base ? `${base}/team/members` : "/api/team/members";
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${options.token}`, "X-Org-Id": options.orgId },
  });
  if (!res.ok) throw new Error("Failed to load team members.");
  return res.json();
}

/** Update a member's can_see_usage and personal_limit. Admin only. */
export async function updateTeamMember(options: {
  token: string;
  orgId: string;
  memberUserId: string;
  can_see_usage?: boolean;
  personal_limit?: number | null;
}): Promise<{ ok: boolean }> {
  const base = getApiBase();
  const url = base ? `${base}/team/members/${encodeURIComponent(options.memberUserId)}` : `/api/team/members/${encodeURIComponent(options.memberUserId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.token}`,
      "X-Org-Id": options.orgId,
    },
    body: JSON.stringify({
      can_see_usage: options.can_see_usage,
      personal_limit: options.personal_limit,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Failed to update member.");
  }
  return res.json();
}

export function isParserApiConfigured(): boolean {
  return !!import.meta.env.VITE_PARSER_API_URL;
}

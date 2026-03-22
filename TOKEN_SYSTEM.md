# Smart Address UK — Token system plan

## Current behaviour (as implemented)

| Who | Usage key | Allowance | Notes |
|-----|-----------|-----------|--------|
| **Anonymous** | (none) | 1 address per request, 10 req/min per IP | No sign-up |
| **Signed-in, no org** (personal) | `user:{user_id}` | 50 addresses/month | Per user |
| **Signed-in, in org, free** | `org:{org_id}` | 50 addresses/month | **Shared across the org** |
| **Signed-in, in org, paid** | (no deduction) | No limit in code | Plan limits (1k / 5k / 15k) not yet enforced |

So today: **free tier is already org-based when you’re in an org** (50 shared). Paid is org-based (subscription per org) but we don’t yet cap usage to the plan.

The asymmetry you’re seeing: we sometimes describe it as “50 per user” (e.g. for personal accounts), but when you’re in a company/org it’s “50 per org” (shared). When you pay, it’s clearly “tokens assigned to the company”.

---

## Option A: Everything org-centric when in an org (recommended)

**Rule:** When the user is in an org, all tokens (free and paid) are for the **org**. When the user has no org (personal), tokens are for the **user**.

| Who | Allowance |
|-----|-----------|
| Anonymous | 1 address/request, rate limited |
| Personal (no org) | 50 addresses/month per user |
| Org, free | 50 addresses/month **per org** (shared) |
| Org, paid | Plan allowance **per org** (e.g. 2,000 / 5,000 / 15,000), shared |

**Pros**

- Simple mental model: “company = one pool; personal = your own pool.”
- Matches billing: payment is per org, so usage is per org.
- No gaming by adding many users to get 50×N free tokens.
- Current code already does this for free (org key when org present).

**Cons**

- Small free teams share one 50-token pool (might feel tight).

**What to do**

- Keep current logic.
- Enforce **paid** plan caps: when org has subscription, deduct from org’s paid allowance (1k/5k/15k from Stripe plan) instead of “unlimited.”
- Copy/messaging: say “50 addresses/month for your team” when in org, “50 addresses/month” when personal.

---

## Option B: Free per user, paid per org

**Rule:** Free = 50 tokens **per user** (even in an org). Paid = plan allowance **per org** (shared).

| Who | Allowance |
|-----|-----------|
| Anonymous | 1 address/request, rate limited |
| Personal (no org) | 50 addresses/month per user |
| Org, free | 50 addresses/month **per user** (each member has 50) |
| Org, paid | Plan allowance **per org** (shared) |

**Pros**

- More generous for small free teams (e.g. 5 people = 250 free).
- Clear story: “everyone gets 50 to try; when the company pays, you share the company pool.”

**Cons**

- Easier to game (create many accounts / invite many users to get more free usage).
- Code change: free tier must track usage by **user** even when in org (and only use org for paid).

**What to do**

- Change free-tier usage key to always `user:{user_id}` (never org for free).
- Paid tier: keep org-based pool and plan caps.

---

## Recommendation

**Option A (org-centric when in an org)** is the better default:

1. Aligns with “company pays → company pool” and avoids abuse.
2. Already implemented for free; you only need to add **paid plan caps** and clear wording.

If you want to be more generous for free teams, you could:

- Keep Option A but **raise** free org allowance (e.g. 100 or 150 per org), or  
- Switch to Option B and accept some gaming risk and the extra logic (per-user free when in org).

---

## Implementation checklist (Option A)

- [x] Free: 50 per org when in org, 50 per user when personal (done).
- [x] **Paid:** For orgs with active subscription, load plan (Starter / Pro / Corporate) and monthly cap (1,000 / 5,000 / 15,000). Deduct from org usage; reject when over cap (done).
- [x] **Usage API:** When paid, return `tokens_used`, `tokens_limit` = plan cap (done).
- [ ] **Copy:** Pricing and demo: “50 addresses/month for your team” (org) vs “50 addresses/month” (personal); paid: “1,000 addresses/month for your team,” etc.

If you tell me which option you want (A or B, and any tweaks like a higher free org allowance), I can outline the exact code changes next (e.g. where to add plan caps and how to read plan from Stripe).

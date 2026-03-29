# Data processing map — Smart Address UK

Internal reference (not a legal document). Aligns with the public Privacy Policy. Update when architecture changes.

| Category | Examples | Where it lives | Controller | Typical retention (high level) |
|----------|----------|----------------|------------|--------------------------------|
| Account & org (auth) | Email, name, user id, org id, roles | **Clerk** (SaaS) | SMARTADDRESS LTD; Clerk acts as processor | While account active + brief post-closure per Clerk |
| Session / sign-in UI | Cookies, local storage for Clerk | Browser + Clerk | As above | Session / Clerk policy |
| Billing | Customer id, subscription, invoices, payment metadata | **Stripe** | SMARTADDRESS LTD; Stripe as processor | Years (tax / disputes) per Stripe |
| Usage metering | Monthly address counts per org, overage counters, org settings | **SQLite** `usage.db` on API host (path from `USAGE_DB_PATH`) | SMARTADDRESS LTD | Rolling months on disk until you define cleanup |
| Goodwill / admin audit | Org id, period, token adjustments, reason text | SQLite `admin_audit_log` | SMARTADDRESS LTD | Until you define archival |
| Address text in requests | Lines pasted for `/parse` | **Transient** in API memory for the request; not written to `usage.db` as content | SMARTADDRESS LTD | Not stored as payload in app DB; host must not log bodies; `ADDRESS_PARSE_DEBUG` must stay **off** in production |
| Support | Email threads to help@smartaddress.uk | Mail host / inbox | SMARTADDRESS LTD | ~24 months from last message in thread (see Privacy Policy) |
| Website static | HTML/JS/CSS | **Render** (or other) static hosting | N/A for personal data | N/A |
| API runtime logs | Stdout/stderr, access-style lines | Host (e.g. Render) | Configure no body logging; no parse debug prints | Host retention (e.g. 7–30 days by plan) |
| ICO fee / registration | Legal obligation to pay and appear on register | [ICO register of fee payers](https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/) | SMARTADDRESS LTD | Renew fee when due |

**Subprocessors (summary):** Clerk ([subprocessors](https://clerk.com/legal/subprocessors)), Stripe ([service providers](https://stripe.com/legal/service-providers)), plus your chosen website/API hosts.

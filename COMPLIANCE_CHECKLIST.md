# Compliance checklist — Smart Address UK

Use this to track privacy/compliance work. **Not legal advice.** Review with a solicitor for your risk profile.

---

## Done (in repo or engineering)

| Item | Notes |
|------|--------|
| **Host / logs (step 1)** | Render HTTP request logs do not include JSON bodies (see [Render docs](https://render.com/docs/logging#http-request-logs)). Parser `DEBUG` prints gated behind `ADDRESS_PARSE_DEBUG` (default **off**) — see `address-splitter-main/address_parsing_core.py`. |
| **Public Privacy / Terms** | `smart-address-ai-main`: `/privacy`, `/terms`. Company: SMARTADDRESS LTD. Clerk + Stripe links, subprocessors, transfers, B2B DPA contact. |
| **Stripe disclosures (step 3)** | Privacy Policy links to [stripe.com/privacy](https://stripe.com/privacy), [service providers](https://stripe.com/legal/service-providers), [legal hub](https://stripe.com/legal). |
| **Internal data map (step 4)** | This repo: `DATA_PROCESSING_MAP.md`. |
| **Support retention (step 5)** | Privacy §5: ~24 months from last message in a thread (adjust if your mailbox policy differs). |
| **B2B DPA route** | Privacy §8: email `help@smartaddress.uk` for DPA discussions; Clerk DPA accepted in **your** Clerk dashboard when required. |
| **ICO data protection fee** | Paid — add your ICO registration reference to `icoRegistrationNumber` in `smart-address-ai-main/src/lib/legalEntity.ts` so Privacy §1 shows the public line + link to the [register of fee payers](https://ico.org.uk/about-the-ico/what-we-do/register-of-fee-payers/). |

---

## Your action (we cannot do for you)

| Item | What to do |
|------|------------|
| **Clerk DPA** | In [Clerk Dashboard](https://dashboard.clerk.com) → accept/sign the Data Processing Addendum if your contracts or insurer require it. |
| **ICO reference on site** | Paste your fee-payer reference into `legalEntity.ts` → `icoRegistrationNumber` (confirmation email or ICO register). |
| **Solicitor** | Have Terms + Privacy reviewed under English law, especially if you sell to consumers or regulated sectors. |
| **Usage DB cleanup** | Decide if/when to delete old `usage` / audit rows; update `DATA_PROCESSING_MAP.md` and Privacy §5 when you automate it. |
| **Mailbox** | Confirm `help@` actually retains ~24 months or change Privacy text to match reality. |
| **Annual review** | Once a year: skim Clerk + Stripe legal pages, subprocessors lists, bump `lastUpdated` in `smart-address-ai-main/src/lib/legalEntity.ts` if you change wording. |

---

## Optional later

- Cookie / consent banner if you add marketing analytics or non-essential cookies beyond Clerk/Stripe flows.
- Customer-facing DPA template once a solicitor signs off.

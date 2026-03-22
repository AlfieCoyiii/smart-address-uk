# Stripe: paid-plan overage (per address)

Your app bills **included addresses** on the base subscription (Starter 2,000 / Pro 5,000 / Corporate 15,000). **Overage** is each successful split **above** that cap, at **6p / 4p / 2p** per address (Starter / Pro / Corporate).

The backend:

1. Adds a **second subscription line item** at Checkout (metered price).
2. After each parse, for paid teams, records **only overage** units via Stripe’s **usage records** API.

If you **do not** set the overage price env vars, behaviour stays as before: **hard cap** at the included amount (402 when over limit).

---

## 1. Create metered prices in Stripe

For **each** paid product (Starter, Pro, Corporate), add a **second price** used only for overage.

1. **Product catalog** → open e.g. **Starter** → **Add another price**.
2. **Pricing model**: **Recurring** → **Usage is metered** → **Sum of usage values during period**.
3. **Price per unit** (GBP):
   - Starter: **£0.06** (6p)
   - Pro: **£0.04** (4p)
   - Corporate: **£0.02** (2p)
4. **Billing period**: **Monthly** (must align with base plan billing).
5. Save and copy each **Price ID** (`price_...`).

> **Important:** The base price stays **licensed** (fixed monthly). The overage price must be **metered** (`usage_type=metered` in the API). Do not put the included 2k/5k/15k on the metered price — the app only reports **addresses beyond** the cap.

---

## 2. Backend environment variables

In **address-splitter-main** `.env` (next to your existing Stripe keys):

```bash
# Existing base subscription prices
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_CORPORATE=price_xxx

# New: metered overage prices (one per plan)
STRIPE_PRICE_OVERAGE_STARTER=price_xxx
STRIPE_PRICE_OVERAGE_PRO=price_xxx
STRIPE_PRICE_OVERAGE_CORPORATE=price_xxx
```

Restart **uvicorn** after changes.

When all three `STRIPE_PRICE_OVERAGE_*` are set:

- New checkouts include **base + metered** line items.
- Usage **over** the plan cap is allowed and reported to Stripe.
- Invoices show base fee + variable overage at period end.

If overage env vars are **missing**, paid teams keep a **hard cap** (no overage billing).

---

## 3. New subscribers

No frontend change required: Checkout is built on the server. As long as overage price IDs are in `.env`, **Subscribe** on Pricing creates a subscription with:

- Item 1: base plan (£65 / £120 / £280).
- Item 2: metered overage (6p / 4p / 2p per reported unit).

---

## 4. Existing customers (already subscribed, one line item)

They **do not** have the metered item yet. Options:

### A. Stripe Dashboard (one team)

1. **Customers** → find customer (metadata `org_id` or email).
2. **Subscriptions** → **Update subscription** → **Add product** → select the correct **metered overage price** for their plan.
3. Proration: usually **none** for a new $0 base metered line until usage is reported.

### B. Stripe API / script

`POST /v1/subscriptions/{sub_id}` with `items` containing the new `price` (metered), `subscription` unchanged.

Until the metered item exists, the app **still allows** overage locally (if env is set) but **logs** a warning when reporting fails — fix by adding the item.

---

## 5. Stripe Customer Portal

Ensure the portal allows customers to **update subscription** / **switch plans** if you use upgrades/downgrades. Overage line items should **stay attached** when changing base plan (you may need to **swap** the metered price when they move Starter → Pro — Stripe or a webhook can help; otherwise manually align metered price with base plan).

---

## 6. Invoicing and testing

- **Test mode**: use test clock or wait for period end; metered usage appears on the next invoice.
- **Usage records** are **incremental** (`action=increment`): each overage address in the app adds `quantity=1` for that billing period.
- Stripe **aggregates** and invoices at renewal.

---

## 7. Optional improvements

| Topic | Idea |
|--------|------|
| **Webhooks** | `invoice.paid` / `customer.subscription.updated` to sync plan changes without relying only on API reads. |
| **Spending cap** | Block parses over cap + max overage £X (store cap in DB; compare to Stripe preview or local overage tally). |
| **Meters API** | New Stripe **Billing Meters** can replace classic usage records; would need a different reporting path in code. |
| **Idempotency** | If you retry parses, avoid double-counting (request IDs / dedupe). |

---

## 8. Summary checklist

- [ ] Create 3 metered GBP prices (6p, 4p, 2p per unit, monthly).
- [ ] Set `STRIPE_PRICE_OVERAGE_*` in backend `.env`.
- [ ] Restart API.
- [ ] Test new Checkout → confirm subscription has **two** items.
- [ ] Parse more addresses than included → confirm usage appears under the metered item in Stripe.
- [ ] Add metered item for any **legacy** single-item subscriptions.

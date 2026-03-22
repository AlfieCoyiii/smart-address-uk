# Where to put API keys (replace text — do not commit real secrets)

Use **two files** (one backend, one frontend). If you already have these files, **replace** the old values when switching from Stripe test → live.

---

## 1) Backend — `address-splitter-main/.env`

| Action | What to do |
|--------|------------|
| **File path** | `Smart Address UK/address-splitter-main/.env` |
| **If missing** | Copy `address-splitter-main/.env.example` → rename copy to `.env` |
| **If it exists** | **Replace** `STRIPE_SECRET_KEY` and all `STRIPE_PRICE_*` with **live** values when going live |

Open `.env.example` in the same folder for the full list of variable names.

After any change: **restart the API** (uvicorn).

---

## 2) Frontend — `smart-address-ai-main/.env.local`

| Action | What to do |
|--------|------------|
| **File path** | `Smart Address UK/smart-address-ai-main/.env.local` |
| **If missing** | Copy `smart-address-ai-main/.env.example` → rename copy to `.env.local` |
| **If it exists** | **Replace** `VITE_STRIPE_PRICE_*` with the **same live** `price_…` IDs as the backend; **replace** `VITE_CLERK_PUBLISHABLE_KEY` with Clerk **production publishable** key when you go live |

After any change: **restart** `npm run dev`, or **rebuild** the site for production.

---

## Do you replace current keys?

- **Yes**, when moving to Stripe **live**: replace test Stripe secret and test price IDs with **live** secret and live price IDs from the Stripe Dashboard.
- **Clerk**: use the **production publishable** key in `.env.local` for production; keep the development key for local dev if you want.

---

## Quick reference

- **Stripe secret** → only in `address-splitter-main/.env` as `STRIPE_SECRET_KEY`
- **Stripe price IDs for buttons** → `smart-address-ai-main/.env.local` as `VITE_STRIPE_PRICE_*` (must match backend plan prices)
- **Clerk publishable** → `smart-address-ai-main/.env.local` as `VITE_CLERK_PUBLISHABLE_KEY`

You do **not** need to put Stripe’s **publishable** key in this project for Checkout (not used by the current code).

---

## “No such price” when clicking Subscribe

Stripe gets the subscription **price** from the **frontend** env vars (`VITE_STRIPE_PRICE_*`). The API also attaches **metered overage** prices from **`STRIPE_PRICE_OVERAGE_*`** in the backend `.env`.

1. Open **Stripe → Live mode → Products** and copy each plan’s **Price ID** (`price_…`).
2. Put the **same three IDs** in:
   - `address-splitter-main/.env` → `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CORPORATE`
   - `smart-address-ai-main/.env.local` → `VITE_STRIPE_PRICE_STARTER`, `VITE_STRIPE_PRICE_PRO`, `VITE_STRIPE_PRICE_CORPORATE`
3. **Restart** `npm run dev` after changing `.env.local` (Vite reads env at startup).
4. If you set **overage** IDs on the API, they must be **valid live metered** `price_…` values; wrong or test IDs will also trigger “no such price”.

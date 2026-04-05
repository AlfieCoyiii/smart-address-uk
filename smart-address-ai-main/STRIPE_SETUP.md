# Stripe subscription setup

Subscriptions are tied to **teams** (Clerk Organizations). The **billing admin** (person who creates the team or an org admin) subscribes; team members use that plan’s address allowance.

---

## 1. Stripe account and keys

1. Sign up or log in at **https://dashboard.stripe.com**.
2. Get your **Secret key**: Dashboard → **Developers** → **API keys** → **Secret key** (Stripe shows separate test vs live keys — use the one that matches your mode).
3. You’ll use this only on the **backend** (never in the frontend).

---

## 2. Create products and prices in Stripe

Create three **Products** (one per plan) with **recurring** prices:

| Plan       | Suggested price | Billing   | Notes                    |
|-----------|------------------|-----------|--------------------------|
| Starter   | £35/month       | Monthly   | 1,000 addresses included |
| Pro       | £120/month      | Monthly   | 5,000 addresses included |
| Corporate | £280/month      | Monthly   | 15,000 addresses included |

**In Stripe Dashboard:**

1. Go to **Product catalog** → **Add product**.
2. **Name**: e.g. "Starter" (or "Smart Address UK – Starter").
3. **Pricing**: **Recurring** → **Monthly** → set amount (e.g. 35 GBP).
4. Click **Save product**.
5. On the product page, open the **Price** and copy the **Price ID** (e.g. `price_1ABC...`). You’ll need this for the frontend.
6. Repeat for **Pro** and **Corporate**.

**Metered overage** (per address beyond included amount): see **[STRIPE_OVERAGE.md](./STRIPE_OVERAGE.md)** for Stripe setup and env vars (`STRIPE_PRICE_OVERAGE_*`).

---

## 3. Backend (address-splitter-main) – Secret key

The FastAPI app needs the Stripe secret key so it can create Checkout and Customer Portal sessions.

**Option A – env file (recommended for local)**

In **address-splitter-main**, create or edit `.env` (and add it to `.gitignore` if present):

```bash
# In address-splitter-main/.env — paste the value from Stripe (never commit this file)
STRIPE_SECRET_KEY=paste_your_stripe_secret_key_here
```

Then run the API so it loads env vars, e.g.:

```bash
cd address-splitter-main
# If using python-dotenv, install it and the app can load .env
pip install python-dotenv
uvicorn parse_api:app --reload --port 8000
```

**Option B – export in terminal**

```bash
export STRIPE_SECRET_KEY=paste_your_stripe_secret_key_here
uvicorn parse_api:app --reload --port 8000
```

**Note:** The current `parse_api.py` reads `os.environ.get("STRIPE_SECRET_KEY")`. If you want to load from a `.env` file, add `python-dotenv` and at the top of `parse_api.py` add:

```python
from dotenv import load_dotenv
load_dotenv()
```

---

## 4. Frontend – Price IDs

In **smart-address-ai-main**, add the three Price IDs to `.env.local` (same file as Clerk):

```bash
VITE_STRIPE_PRICE_STARTER=price_xxxxxxxxxxxxx
VITE_STRIPE_PRICE_PRO=price_xxxxxxxxxxxxx
VITE_STRIPE_PRICE_CORPORATE=price_xxxxxxxxxxxxx
```

Restart the frontend (`npm run dev`) after changing env.

---

## 5. Going live (remove “Sandbox” in Checkout)

Stripe Checkout shows **Sandbox** when the session is created with a **test** Stripe secret key. Your app does **not** control that label — the **parser API’s** `STRIPE_SECRET_KEY` does.

1. In Stripe Dashboard, turn **off** “Test mode” and copy the **live** secret key from **API keys**.
2. Set **`STRIPE_SECRET_KEY`** on the API (and all **`STRIPE_PRICE_*` / `STRIPE_PRICE_OVERAGE_*`**) to **live** IDs from the live product catalog.
3. Set **`VITE_STRIPE_PRICE_*`** in the frontend to the **same live** recurring price IDs and **rebuild/redeploy** the site.
4. Restart the API.

The Pricing page calls **`GET /stripe-status`** and shows whether the API sees **live** vs **test** keys (`api_key_mode`).

---

## 6. Test the flow

1. Start the **backend** (with `STRIPE_SECRET_KEY` set) on port 8000.
2. Start the **frontend** (`npm run dev`) with the three `VITE_STRIPE_PRICE_*` set.
3. Sign in, **create or select a team** (Organization Switcher).
4. Go to **Pricing** → click **Subscribe** on a plan. You should be redirected to Stripe Checkout.
5. Use test card **4242 4242 4242 4242** and any future expiry and CVC.
6. After payment, you’re redirected back to the site. **Manage billing** opens the Stripe Customer Portal (subscription, payment method, invoices).

---

## Promotion codes (discounts) on Checkout

Checkout only shows **“Add promotion code”** if the API creates the session with **`allow_promotion_codes`** enabled. This repo does that by default in **`POST /create-checkout-session`** (`parse_api.py`). Set **`STRIPE_CHECKOUT_ALLOW_PROMOTION_CODES=false`** on the parser API if you need to turn it off.

**In Stripe Dashboard**

1. **Billing** → **Coupons** → create a **coupon** (percent off, amount off, duration, which products it applies to — include the subscription price you sell).
2. On that coupon, add a **promotion code** (the text customers type, e.g. `ENTERPRISEFREE`). A coupon alone without a promotion code cannot be entered on Checkout.
3. Use **test** vs **live** mode consistently: the code must exist in the same mode as your API’s `STRIPE_SECRET_KEY`.

**Note:** You cannot combine `allow_promotion_codes` with pre-applied `discounts` on the same session; this integration only uses `allow_promotion_codes`.

**Paid plan still shows as “free” after Checkout:** The API maps your Clerk **organization** to a Stripe **Customer** via `metadata.org_id`. You must be on the **same team** in the app that you used when subscribing. Also, Stripe often sets new subs to **`trialing`** (not only `active`); the parser API treats **`active`**, **`trialing`**, and **`past_due`** as entitled — redeploy the API if you’re on an older build that only checked `active`.

**Stripe shows a different email than my Clerk login:** The **Customer** email in Stripe is usually whatever **Checkout / Apple Pay / Google Pay** supplied (often your **Apple ID** or wallet email), not your Smart Address sign-in address. **Billing is still tied to the Clerk workspace (org)** you had selected when you clicked Subscribe — check the **org switcher** and match **Client reference** / **metadata `org_id`** on the Stripe Checkout session to that org’s ID in Clerk.

**Many Stripe customers:** Older builds used `Customer.list` with a low limit and could **miss** your customer so the app stayed on “free”. New API code uses **`Customer.search(metadata['org_id'])`** when available.

### Free trial — why you can’t find it on an existing price

Stripe often **does not let you add or edit a trial on a price that already exists**; many fields are fixed at creation time. For **Stripe Checkout**, the supported approach is to pass **`subscription_data.trial_period_days`** when creating the Checkout Session.

This API supports that via env (parser / Render):

```bash
STRIPE_CHECKOUT_TRIAL_PERIOD_DAYS=14
```

Use **`1`–`730`** days, or **remove / leave unset** for no trial (typical production). Redeploy the API after changing it. See Stripe: [Configure free trials (Checkout)](https://docs.stripe.com/payments/checkout/free-trials).

---

## 7. Production

- Use **live** Stripe secret keys in the backend and create **live** products/prices; put the live Price IDs in your frontend build env.
- In Stripe Dashboard, set **Customer portal** branding and options (e.g. cancel subscription, update payment method).
- **Overage**: implemented when `STRIPE_PRICE_OVERAGE_*` are set — see **STRIPE_OVERAGE.md**.

### Customer portal: empty payment method, no invoices, can’t cancel

**£0 / 100% coupon checkout:** Stripe often **does not save a payment method** on the Customer when nothing was charged. That is normal — there was no card to keep on file for recurring charges until the next invoice. You can still add a card in the portal if **Customers can update their payment methods** is enabled.

**Missing cancel / invoices / billing details:** The portal only shows what you turn on in Stripe:

1. Dashboard → **Settings** → **Billing** → **Customer portal** (or **Product catalog** → **Customer portal** depending on your Stripe UI).
2. Under **Subscriptions**, ensure **Cancel subscriptions** (and any options you want) are **on**.
3. Under **Invoices**, turn on **Invoice history** if you want past invoices and PDFs in the portal.
4. Save, then open **Manage billing** from your app again.

If you use a **custom portal configuration** (multiple configs), copy its **Configuration ID** (`bpc_…`) and set **`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`** on the parser API so `create-portal-session` uses it (otherwise Stripe uses your **default** portal config).

**£0 invoices:** Stripe may still create a **paid £0 invoice** for the subscription; check **Billing** → **Invoices** in the Dashboard. If invoice history is disabled in the portal, customers won’t see them there even if they exist.

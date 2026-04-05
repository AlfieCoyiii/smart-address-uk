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

---

## 7. Production

- Use **live** Stripe secret keys in the backend and create **live** products/prices; put the live Price IDs in your frontend build env.
- In Stripe Dashboard, set **Customer portal** branding and options (e.g. cancel subscription, update payment method).
- **Overage**: implemented when `STRIPE_PRICE_OVERAGE_*` are set — see **STRIPE_OVERAGE.md**.

# Clerk sign-up & log-in setup

Your app is wired to **Clerk** for authentication. Follow these steps once to get sign-up and log-in working.

---

## Step 1: Create a Clerk account and application

1. Go to **https://dashboard.clerk.com** and sign up (or log in).
2. Click **“Add application”** (or **“Create application”**).
3. Name it (e.g. “Smart Address UK”) and choose **Email** and **Password** as sign-in options (you can add Google, etc. later).
4. Click **Create application**.

---

## Step 2: Get your publishable key

1. In the Clerk dashboard, open your application.
2. Go to **Configure** → **API keys** (or **Developers** → **API keys**).
3. Find the **Publishable key** row (Clerk labels test vs production keys in the dashboard).
4. Copy **only** that publishable value — **not** the **Secret key**, and **not** a separate **Standard** / machine **API key** from Clerk’s newer “API keys” (machine auth) section. Those are for backend integrations, not for `ClerkProvider` in React.
5. Use the same **instance** as your app: toggle **Development** vs **Production** in the Clerk dashboard header so the key matches your environment.

### “Publishable key is invalid”

| Cause | Fix |
|--------|-----|
| Pasted **Secret** key into `.env.local` | Use **Publishable** key only in the frontend (different field in Clerk). |
| Pasted a **machine / User API key** (“Standard” key from the wrong table) | Use the main app **Publishable key** on the same API keys screen as the Secret key. |
| **Extra space** or line break in `.env.local` | One line, no spaces around `=`. Restart `npm run dev`. |
| **Dev vs Prod** mismatch | Use a **Development** publishable key when the dashboard is in Development, and **Production** when you’ve switched Clerk to production. |
| Old build | After changing `.env.local`, restart Vite; for `vite preview`, run `npm run build` again. |

---

## Step 3: Add the key to your project

1. In the **smart-address-ai-main** folder, create a file named **`.env.local`** (same folder as `package.json`).
2. Add this line, pasting your real key:

   ```
   VITE_CLERK_PUBLISHABLE_KEY=paste_your_clerk_publishable_key_here
   ```

3. Save the file.

**Note:** `.env.local` is normally git-ignored so your key is not committed. Use `.env.example` as a template (without real keys).

---

## Step 4: Allow your dev URL in Clerk (for dev only)

1. In the Clerk dashboard, go to **“Paths”** or **“Settings”** → **“Paths”** (or **“Domains”**).
2. Under **Allowed redirect URLs** or **Redirect allowlist**, add:
   - `http://localhost:8080`
   - `http://127.0.0.1:8080`
3. Save.

(If you’re only using the default Clerk paths, this may already work; add these if you get redirect errors.)

---

## Step 5: Run the site and test

1. From **smart-address-ai-main** run:

   ```bash
   npm run dev
   ```

2. Open **http://localhost:8080**.
3. Click **“Get Started”** (or go to **/sign-up**). You should see Clerk’s sign-up form.
4. Create an account, then you should be signed in and see the **user button** (avatar) in the navbar.
5. Click the avatar → **Sign out** to test log-out, then **Log in** to sign in again.

---

## Step 6: Backend API must verify Clerk (or everyone counts as “anonymous”)

The Python API (`address-splitter-main`) only allows **one address per request** for anonymous users. **Signed-in** users get your free tier (50/month) or paid caps — but only if the API can verify the Clerk JWT.

That requires **`CLERK_JWKS_URL`** (and usually **`CLERK_ISSUER`**) in **`address-splitter-main/.env`**:

1. Clerk Dashboard → **API Keys**.
2. Under **JWKS URL** (or from **Frontend API**), your dev instance looks like:
   - `CLERK_JWKS_URL=https://YOUR_INSTANCE.clerk.accounts.dev/.well-known/jwks.json`
   - `CLERK_ISSUER=https://YOUR_INSTANCE.clerk.accounts.dev`  
   (`YOUR_INSTANCE` matches the Clerk Frontend API host for your app.)

Without these, the API **never** recognises sign-in → you always get the “sign in to split more than 1” behaviour even when logged in.

Restart the API after editing `.env`:

```bash
cd address-splitter-main && ./venv/bin/uvicorn parse_api:app --reload --port 8000
```

---

## Step 7: Organizations + automatic workspace (production)

Each signed-in user gets **one Clerk Organization** (“workspace”) so credits and Stripe billing use a single org id (no reset when “creating a team”).

1. In Clerk Dashboard, enable **Organizations** (Configure → **Organizations** — turn on if prompted).
2. Set **`CLERK_SECRET_KEY`** in **`address-splitter-main/.env`** (same **Secret key** as on the API Keys page — required for creating orgs server-side).
3. **Webhook (recommended):**  
   - **Webhooks** → **Add endpoint**  
   - URL: `https://YOUR_PARSER_API_HOST/webhooks/clerk` (your Render API URL, no trailing slash issues)  
   - Subscribe to **`user.created`**  
   - Copy the endpoint **Signing secret** into **`CLERK_WEBHOOK_SIGNING_SECRET`** in `.env`  
4. Install API deps: `pip install svix requests` (or `pip install -r requirements.txt`).

If the webhook is missing, the app still calls **`POST /team/ensure-workspace`** after sign-in to create the workspace (slightly later than the webhook). Users who already had **personal** usage before this feature get that usage **migrated** into their new org for the current month.

---

## What’s already done in the app

- **ClerkProvider** wraps the app and uses `VITE_CLERK_PUBLISHABLE_KEY`.
- **/sign-in** and **/sign-up** show Clerk’s sign-in and sign-up components (with your Logo and copy above them).
- **/login** and **/signup** redirect to **/sign-in** and **/sign-up** so old links still work.
- **Navbar**: when signed out you see “Log in” and “Get Started”; when signed in you see Clerk’s **UserButton** (avatar and account menu).

---

## Optional: styling Clerk to match your theme

Clerk’s components use their own styles by default. To match your site’s look (e.g. dark/light, colours), use **Customization** in the Clerk dashboard (**“Customization”** → **“Theme”** / **“Appearance”**) or the `appearance` prop on `<SignIn />` and `<SignUp />` in `Login.tsx` and `SignUp.tsx`. See: https://clerk.com/docs/customization/overview.

---

## Troubleshooting

- **“Missing VITE_CLERK_PUBLISHABLE_KEY”** in the browser console  
  → Add `VITE_CLERK_PUBLISHABLE_KEY` to `.env.local` and restart `npm run dev`.

- **Redirect errors or “invalid redirect”**  
  → Add `http://localhost:8080` (and `http://127.0.0.1:8080`) to allowed redirect URLs in the Clerk dashboard.

- **Sign-up or sign-in form doesn’t appear**  
  → Confirm you pasted the **Publishable** key from Clerk (not the Secret key) and restarted the dev server after creating `.env.local`.

- **Signed in but only 1 address splits / “sign in to split more”**  
  → Set `CLERK_JWKS_URL` and `CLERK_ISSUER` on the API (Step 6) and restart uvicorn. Ensure `pyjwt[crypto]` is installed in the API venv.

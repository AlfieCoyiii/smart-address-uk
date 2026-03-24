# Exact steps: Render + GoDaddy + Clerk (this project)

Use this as a **checklist**. Put secrets **only** in Render and Clerk — **not** in chat with AI, and **not** committed to Git.

**Repo layout assumed:** one Git repository containing both folders:

- `address-splitter-main/` → Python API  
- `smart-address-ai-main/` → React (Vite) site  

If your GitHub repo is only one of these folders, say which one — steps change slightly.

---

## Part 0 — On your computer (once)

| Step | What you do |
|------|----------------|
| 0.1 | Push your project to **GitHub** (or GitLab / Bitbucket that Render supports). |
| 0.2 | You **do not** need to give anyone your keys. You will **copy the same values** you already use in local `.env` / `.env.local` into **Render’s Environment** screens. |
| 0.3 | In this repo, **`parse_api.py` already supports `CORS_ALLOWED_ORIGINS`**. You only set that variable on Render (no extra code change). |

---

## Part 1 — Render: create the **API** (Web Service)

Do these **in order** on [dashboard.render.com](https://dashboard.render.com).

### 1.1 Start a new service

1. Click **New +** (top right).  
2. Click **Web Service**.  
3. **Connect** your Git account if asked, then **select the repository** that contains this project.  
4. Click **Connect** (or Continue).

### 1.2 Service settings (fill the form)

| Field on Render | What to enter |
|-----------------|---------------|
| **Name** | Anything, e.g. `smart-address-api` |
| **Region** | Choose closest to UK/your users |
| **Branch** | Usually `main` (or your default branch) |
| **Root Directory** | `address-splitter-main` |
| **Runtime** | **Python 3** |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn parse_api:app --host 0.0.0.0 --port $PORT` |
| **Instance type** | Free or paid — your choice |

Optional but recommended:

- **Environment** → add variable: **`PYTHON_VERSION`** = `3.12.4` (or another 3.11+ version Render lists).

### 1.3 API environment variables (same tab: **Environment**)

Click **Add Environment Variable** for **each** row. **Key** must match exactly.

**Required for billing + plans**

| Key | Where you get the value |
|-----|-------------------------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → **Live** → API keys → **Secret key** |
| `STRIPE_PRICE_STARTER` | Stripe → Product → Price ID `price_…` |
| `STRIPE_PRICE_PRO` | Same |
| `STRIPE_PRICE_CORPORATE` | Same |

**If you use metered overage** (you set these locally too)

| Key | Value |
|-----|--------|
| `STRIPE_PRICE_OVERAGE_STARTER` | Live metered `price_…` |
| `STRIPE_PRICE_OVERAGE_PRO` | Live metered `price_…` |
| `STRIPE_PRICE_OVERAGE_CORPORATE` | Live metered `price_…` |

**Required so signed-in users work on the API**

| Key | Value |
|-----|--------|
| `CLERK_JWKS_URL` | Clerk → **Production** → API keys / JWKS — full URL ending in `/.well-known/jwks.json` |
| `CLERK_ISSUER` | Same Frontend API base URL **without** the `/.well-known/jwks.json` path |

**Optional (team / org admin features in app)**

| Key | Value |
|-----|--------|
| `CLERK_SECRET_KEY` | Clerk **Production** **Secret** key (from API keys page) |

**Required for browser → API from your real website**

| Key | Value (example — use your real domain) |
|-----|----------------------------------------|
| `CORS_ALLOWED_ORIGINS` | `https://yourdomain.com,https://www.yourdomain.com` |

Rules:

- **Comma-separated**, no spaces **or** spaces are OK (we trim).  
- Must be **`https://`** if your site is HTTPS.  
- Include **every** origin users use (with and without `www` if both work).  
- After first deploy, if you only have a Render URL for the **frontend**, you can temporarily add e.g. `https://your-frontend-name.onrender.com` until DNS is done.

### 1.4 Deploy API

1. Click **Create Web Service** (or **Save** / **Deploy**).  
2. Wait for build + deploy to finish.  
3. At the top of the service page, copy the URL, e.g. **`https://smart-address-api.onrender.com`**.  
4. **Save this URL** — you need it for the frontend in Part 2.

**Test (optional):** open `https://YOUR-API.onrender.com/health` in a browser — should return JSON, not 404.

---

## Part 2 — Render: create the **website** (Static Site)

### 2.1 New static site

1. **New +** → **Static Site**.  
2. Select the **same repository** as Part 1.

### 2.2 Static site settings

| Field | What to enter |
|-------|----------------|
| **Name** | e.g. `smart-address-web` |
| **Branch** | `main` (or default) |
| **Root Directory** | `smart-address-ai-main` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

### 2.3 Frontend environment variables (critical)

Still on the static site, open **Environment**.

Add **exactly** these keys (values from Stripe / Clerk — same as local `.env.local` where applicable):

| Key | What to paste |
|-----|----------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk **Production** **Publishable** key |
| `VITE_STRIPE_PRICE_STARTER` | Same `price_…` as API `STRIPE_PRICE_STARTER` |
| `VITE_STRIPE_PRICE_PRO` | Same as API |
| `VITE_STRIPE_PRICE_CORPORATE` | Same as API |
| **`VITE_PARSER_API_URL`** | **Full API URL from Part 1.4**, e.g. `https://smart-address-api.onrender.com` — **no** trailing `/` |

**Do not** set `VITE_PARSER_API_URL` to your marketing domain — it must be the **Render API** hostname.

### 2.4 SPA rewrite (required for `/sign-in`, refresh, bookmarks)

Vite only outputs **`/index.html`** at the site root. There is no real file at `/sign-in`, `/team`, etc. **React Router** handles those paths **in the browser** only after `index.html` loads.

- **Why “Log in” from the homepage works:** the first load is `/` (real file). Then the app navigates to `/sign-in` in JS — no new HTML request.
- **Why opening or refreshing `https://yourdomain.com/sign-in` shows 404:** the CDN asks the server for a file named `sign-in`, which does not exist → **white screen / “Not found”.** Clerk then never gets a proper app shell, which also breaks **Continue** on sign-in.

**Fix on Render (Static Site):** Dashboard → your static site → **Redirects / Rewrites** → add a rule ([Render docs](https://render.com/docs/redirects-rewrites)):

| Setting | Value |
|--------|--------|
| **Action** | **Rewrite** (not Redirect) |
| **Source** | `/*` |
| **Destination** | `/index.html` |

Save, then trigger a deploy if Render asks. The repo also includes `public/_redirects` (copied into `dist/`) for hosts that read that file; **Render still needs the Dashboard rule above.**

### 2.5 Deploy frontend

1. **Create Static Site** / deploy.  
2. Wait for build.  
3. Open the **`.onrender.com`** URL Render gives you — site should load.  
4. Open **`/sign-in` in a new tab** (or refresh it) — you should see the login page, **not** 404.  
5. Try **Sign in** and **Pricing**. If parser fails, open browser **Console** — often CORS → fix `CORS_ALLOWED_ORIGINS` on the API to match the **exact** URL in the address bar (including `https` and `www` or not).

**Every time** you change these env vars on the static site, use **Manual Deploy → Clear build cache & deploy** (or redeploy) so Vite rebuilds with new values.

---

## Part 3 — Render: connect your **GoDaddy domain** to the **frontend**

Do this on the **Static Site** service (not the API).

1. Open your **static site** on Render → **Settings**.  
2. Find **Custom Domains**.  
3. Click **Add Custom Domain**.  
4. Enter your domain, e.g. `yourdomain.com` — follow Render’s instructions.  
5. Add **`www.yourdomain.com`** too if you want `www` to work.  

Render will show **DNS records** to create (usually a **CNAME** for `www` pointing at something like `xxxx.onrender.com`).

### Part 3.1 GoDaddy (DNS only)

1. Log in **GoDaddy** → **My Products** → your domain → **DNS** / **Manage DNS**.  
2. **Add** the records **exactly** as Render shows (host/name, type, value, TTL if asked).  
3. For **apex** (`@` / root domain), Render may give **A/ALIAS** instructions — follow Render’s doc for apex + GoDaddy (GoDaddy sometimes uses “Forwarding” or CNAME flattening — follow what Render links you to).  
4. Wait (often 15–60 minutes; can be longer).  
5. Back on Render, domain status should become **Verified** and **SSL** **Certificate** should issue.

### Part 3.2 Fix CORS after you have the real URL

On the **API** Web Service → **Environment**:

- Set `CORS_ALLOWED_ORIGINS` to the **exact** origins users type in the browser, e.g.  
  `https://yourdomain.com,https://www.yourdomain.com`  
- **Save** → Render will redeploy/restart the API.

---

## Part 4 — Clerk (Production) — what to click

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com) → your application.  
2. Switch to **Production** (not Development).  
3. **Configure → API keys** (or **Developers → API keys**):  
   - Copy **Publishable key** → already in Render static site as `VITE_CLERK_PUBLISHABLE_KEY`.  
   - Copy **Secret key** → Render **API** as `CLERK_SECRET_KEY` (if you use team features).  
4. Copy **JWKS URL** and set **issuer** (Frontend API base) → Render **API** as `CLERK_JWKS_URL` and `CLERK_ISSUER`.  
5. **Domains / Paths / Redirect URLs** (exact menu name varies): add:  
   - `https://yourdomain.com`  
   - `https://www.yourdomain.com` (if you use it)  
   - Your Render static URL `https://….onrender.com` while testing  
   - Optional: `http://localhost:8080` for local dev with **production** Clerk  

6. If you started **Clerk custom domain** DNS in GoDaddy: finish verification in Clerk; if JWKS/issuer change, update Render **API** env and restart.

---

## Part 5 — Files in **this repo** / Cursor — what you actually change

| Situation | Action |
|-----------|--------|
| Normal go-live | **No secret files** need to be committed. Keys live in **Render** only. |
| Local development | Keep using `address-splitter-main/.env` and `smart-address-ai-main/.env.local` on your laptop — **gitignored**. |
| Reference for variable names | Open `address-splitter-main/.env.example` and `smart-address-ai-main/.env.example` — same **names** as Render. |
| CORS | Already in code — you only set `CORS_ALLOWED_ORIGINS` on Render. |

**You do not need to “give” keys to an AI.** Copy from Stripe/Clerk into Render yourself.

---

## Part 6 — Order summary (do not skip)

1. Deploy **API** on Render → copy API URL.  
2. Set **API** env (Stripe, Clerk JWKS/issuer, **CORS**).  
3. Deploy **Static Site** on Render with **`VITE_PARSER_API_URL`** = API URL.  
3b. Add **SPA rewrite** `/*` → `/index.html` (Rewrite) on the static site (§2.4).  
4. Test on `*.onrender.com` — confirm **`/sign-in` loads when opened directly**.  
5. Add **custom domain** on **static site** → DNS in GoDaddy.  
6. Update **CORS** on API to your `https://` domain(s).  
7. Add domain URLs in **Clerk** Production.  
8. Redeploy frontend if you changed any `VITE_*` variable.

---

## If something fails

| Symptom | Check |
|---------|--------|
| Build fails on API | Read Render **Logs**; often missing file or wrong root directory. |
| Build fails on static site | Logs show `npm` error; ensure **Root** is `smart-address-ai-main`. |
| **404 / white screen** on `/sign-in` (refresh or direct URL) | Add Render **SPA rewrite**: Source `/*` → Destination `/index.html`, Action **Rewrite** (see §2.4). |
| CORS error in browser | `CORS_ALLOWED_ORIGINS` must match site URL exactly (`www` vs non-`www`). |
| Clerk invalid key | Publishable key on static site; allowed URLs include your domain. |
| Always “anonymous” on API | `CLERK_JWKS_URL` + `CLERK_ISSUER` for **Production** on API service. |

---

## Copy-paste cheat sheet (empty values — fill in Render)

**API (Web Service) — keys only, no values:**

`STRIPE_SECRET_KEY`  
`STRIPE_PRICE_STARTER` `STRIPE_PRICE_PRO` `STRIPE_PRICE_CORPORATE`  
`STRIPE_PRICE_OVERAGE_STARTER` `STRIPE_PRICE_OVERAGE_PRO` `STRIPE_PRICE_OVERAGE_CORPORATE` (if used)  
`CLERK_JWKS_URL` `CLERK_ISSUER`  
`CLERK_SECRET_KEY` (optional)  
`CORS_ALLOWED_ORIGINS`

**Static site:**

`VITE_CLERK_PUBLISHABLE_KEY`  
`VITE_STRIPE_PRICE_STARTER` `VITE_STRIPE_PRICE_PRO` `VITE_STRIPE_PRICE_CORPORATE`  
`VITE_PARSER_API_URL`

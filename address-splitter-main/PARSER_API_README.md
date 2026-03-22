# Parser API (for Smart Address UK website)

The **parse_api.py** FastAPI app runs the same pipeline as **address_parser1.py** (address_parsing_core + CRF + extract_flat_from_building) and exposes it over HTTP for the Lovable frontend.

## Run the API

From this directory (`address-splitter-main`):

```bash
# Create/activate a venv and install deps if needed
pip install -r requirements.txt

# Start the API (must be run from address-splitter-main so Data/ and Pickles/ resolve)
uvicorn parse_api:app --reload --port 8000
```

- **CRF model**: Ensure `crf_model_v3_110925.pkl` is in this directory, or the API will start but return 503 on `/parse`.
- **Stripe** (optional): Set `STRIPE_SECRET_KEY` in a `.env` file in this directory (or export it) to enable subscription checkout and billing portal. To enforce paid plan caps (2,000 / 5,000 / 15,000 addresses per month), also set the same Price IDs as the frontend: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CORPORATE` (each value is a Stripe Price ID like `price_xxxx`). See **smart-address-ai-main/STRIPE_SETUP.md** for full setup.
- **Clerk** (for signed-in usage and free tier): Set `CLERK_JWKS_URL` (and optionally `CLERK_ISSUER`) in `.env` so the API can verify JWTs. Get the JWKS URL from the Clerk Dashboard (API Keys → JWKS) or use your Frontend API URL + `/.well-known/jwks.json`. Without these, all requests are treated as anonymous (1 address, rate limited).
- **Usage and limits**: Anonymous = 1 address per request, 10 requests/min per IP. Signed-in free tier = 50 tokens/month per org (or per user if no org); paid orgs have no token limit. SQLite DB `usage.db` in this directory stores usage and overage limits. Optional `USAGE_DB_PATH` in env overrides the path.
- **Health**: `GET http://localhost:8000/health` reports whether the parser is ready.

## Run the website with the API

1. Start the parser API (above) on port 8000.
2. From **smart-address-ai-main** run the frontend:

   ```bash
   npm run dev
   ```

3. The Vite dev server (port 8080) proxies `/api` to `http://127.0.0.1:8000`, so "Split Addresses" in the UI will use the Python backend. If the API is not running, the site falls back to client-side parsing and shows a toast.

## Production

- Deploy the FastAPI app (e.g. with gunicorn + uvicorn, or any ASGI host).
- Set `VITE_PARSER_API_URL` in the frontend build to your API base URL (e.g. `https://api.yoursite.com`). The frontend will then call `{VITE_PARSER_API_URL}/parse` instead of `/api/parse`.

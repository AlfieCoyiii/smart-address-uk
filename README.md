# Smart Address UK — monorepo

This repository contains **both** parts of the product:

| Folder | What it is |
|--------|------------|
| **`smart-address-ai-main/`** | Website (React + Vite) — what visitors see |
| **`address-splitter-main/`** | Parser API (Python + FastAPI) — address splitting + Stripe |

Deploy on **Render** (or elsewhere) using:

- **Static site** → root directory `smart-address-ai-main`
- **Web service** → root directory `address-splitter-main`

Step-by-step deploy: see **`GO_LIVE_RENDER_GODADDY_CLERK.md`**.

Local secrets stay in:

- `address-splitter-main/.env`
- `smart-address-ai-main/.env.local`

Those files are **not** in Git. Copy variable **names** from each folder’s `.env.example` into your host’s environment (e.g. Render).

# Push this project to GitHub (beginner)

Your code lives in the folder **Smart Address UK**. That whole folder is **one** Git repository with **two** subfolders (website + API). You do **not** need to decide “frontend only” vs “both” — **both are included**.

---

## Step 1 — Create an empty repo on GitHub

1. Log in to [github.com](https://github.com).
2. Click **+** → **New repository**.
3. **Repository name:** e.g. `smart-address-uk` (any name you like).
4. Choose **Public** or **Private**.
5. **Do not** tick “Add a README” / .gitignore / license (keep it empty).
6. Click **Create repository**.

GitHub will show you a URL like:

- `https://github.com/YOUR_USERNAME/smart-address-uk.git`

Copy that URL. Replace `YOUR_USERNAME` and the repo name below when you run commands.

---

## Step 2 — On your Mac: open Terminal

Paste commands **one block at a time**. Change only the `git remote add` line to use **your** URL.

```bash
cd "/Users/alfie/Desktop/Smart Address UK"
```

```bash
git init
```

```bash
git add .
```

```bash
git status
```

**Check `git status`:** you should **not** see `.env` or `.env.local` listed. If you do, **stop** — ask for help before committing.

```bash
git commit -m "Initial commit: website + parser API"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/YOUR_USERNAME/smart-address-uk.git
```

(Replace with your real URL from Step 1.)

```bash
git push -u origin main
```

If GitHub asks you to log in, use a **Personal Access Token** as the password (GitHub no longer accepts account passwords for HTTPS git push).

---

## Step 3 — After the push

On **Render**, connect **this same repository**:

- **Static site** → **Root directory:** `smart-address-ai-main`
- **Web service (API)** → **Root directory:** `address-splitter-main`

Full env vars and commands: **`GO_LIVE_RENDER_GODADDY_CLERK.md`**.

---

## If push says “repository rule violations”

GitHub blocked something in the commit (often **secret scanning** or **large files**). This repo was adjusted to drop the **69MB** `postcode_coords.pkl` from Git and to remove doc text that looked like real API keys.

After pulling these updates, run:

```bash
cd "/Users/alfie/Desktop/Smart Address UK"
git add .
git commit --amend -m "Initial commit: website + parser API"
git push -u origin main
```

If it **still** fails: GitHub → your repo → **Settings** → **Rules** → **Rulesets** — see if **main** is blocked from direct push; or check the **email GitHub sent** for the exact file/rule.

---

## If you already have an old `smart-address-ai` repo

You can either:

- Use a **new** repo (steps above), **or**
- Use the existing repo URL in `git remote add origin ...` — if that repo already has commits, you may need `git pull origin main --allow-unrelated-histories` before pushing (ask if you hit conflicts).

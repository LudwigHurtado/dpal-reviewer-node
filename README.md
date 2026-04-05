# DPAL Verifier Action Portal

A **working verifier shell** (not a decorative dashboard): **live report queue** from your DPAL API, **report detail** with evidence, **verification notes**, **outbound action logging** (call / email / escalate / legal / follow-up), **audit timeline**, and **category playbooks** (environmental, housing, labor, public safety, medical).

Actions persist **locally** in `server/data/verifier-audit.json` until you map them to PostgreSQL/Mongo and real email/SMS/voice providers.

**Docs:** [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`AGENTS.md`](AGENTS.md) · [`claude.md`](claude.md).

## What’s in this repo

- React + Vite + TypeScript — `src/components/VerifierPortal.tsx`
- Express reviewer API — `server/index.mjs` + `server/verifierRoutes.mjs`
- Optional upstream: set **`DPAL_UPSTREAM_URL`** to your **`dpal-ai-server`** host and **`DPAL_UPSTREAM_REPORTS_PATH=/api/reports/feed`**
- Demo rows in the UI if the feed is empty (training data only)

## Run locally

```bash
cd "C:\DPAL Reviewer Node"
npm install
npm run dev:all
```

Open the URL shown in the terminal (typically `http://localhost:5173`). Use `npm run dev` for UI-only with `VITE_USE_MOCK_DATA=true`, or if you point `VITE_API_BASE_URL` at an already-running reviewer API.

## Build for static hosting

```bash
npm run build
npm run preview
```

Output is in `dist/`.

## Deploy on Vercel (GitHub)

The repo is intended to live on GitHub and deploy as a static Vite app.

**Repository:** [github.com/LudwigHurtado/dpal-reviewer-node](https://github.com/LudwigHurtado/dpal-reviewer-node)

1. Sign in at [vercel.com](https://vercel.com) with your GitHub account.
2. **Add New… → Project → Import** the repo **`LudwigHurtado/dpal-reviewer-node`**.
3. Vercel should detect **Vite**. Leave defaults unless you changed the layout:
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. Click **Deploy**. Future pushes to `main` trigger new deployments.

`vercel.json` in this repo pins build/output so settings stay consistent.

## Git identity (first commit)

If Git reports “Please tell me who you are,” set your name and email for this repo (or use `--global`):

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

The initial import used a **local placeholder** identity only so the repository could be created; replace it with your own before pushing.

## Create a GitHub repository

Install [GitHub CLI](https://cli.github.com/) if you want one-command remote creation. From this folder, after `gh auth login`:

```bash
git init
git add .
git commit -m "Initial commit: Validator Review-Node command center concept"
gh repo create dpal-reviewer-node --private --source=. --remote=origin --push
```

Or create an empty repo in the GitHub UI, then:

```bash
git remote add origin https://github.com/<your-org>/dpal-reviewer-node.git
git branch -M main
git push -u origin main
```

## Relationship to DPAL

The dashboard loads **live JSON** from a small Node API in this repo (not a static shell). Run the UI and API together:

```bash
npm run dev:all
```

- **Browser:** Vite dev server proxies `/api` → `http://127.0.0.1:8787` (override with `VITE_DEV_API_PROXY_TARGET`).
- **Endpoints:** `GET /api/reviewer/v1/dashboard`, `GET /api/reviewer/v1/reports`, `GET /api/reviewer/v1/health`.
- **Data file:** `server/data/dashboard.json` — replace or sync from your pipeline for real queues; optional **`DPAL_UPSTREAM_URL`** merges reports from your main DPAL backend (see `.env.example`).

For static hosting only (e.g. Vercel), deploy the Express API separately and set `VITE_API_BASE_URL` to that API’s `/api` origin.

### “404” on `/api/reviewer/v1/verifier/reports`

That path exists **only** on the **Reviewer Node** server (`server/index.mjs`). If `VITE_API_BASE_URL` points at your **main** DPAL API (e.g. `web-production-…up.railway.app`), the browser will get **404** — the filing API does not mount the verifier routes. You need **two** services: (1) main API for `POST/GET /api/reports*`, (2) Reviewer API for `/api/reviewer/v1/verifier/*`, with `DPAL_UPSTREAM_URL` on (2) set to (1)’s origin.

## Live reports + reviewer opinions (production)

The static site (e.g. [dpal-reviewer-node on Vercel](https://dpal-reviewer-node.vercel.app/)) **does not run Node** — it only serves the built UI. To load **real reports** and save **opinions / recommended effects**:

1. **Host the reviewer API** (`server/index.mjs`) on Railway, Render, Fly.io, a VPS, etc. Expose `GET /api/reviewer/v1/dashboard` and `POST /api/reviewer/v1/reports/:reportId/review`.
2. **Point the UI at that API:** in Vercel → Project → Settings → Environment Variables, set **`VITE_API_BASE_URL`** to your API base, e.g. `https://your-api.example.com/api` (no trailing slash). Redeploy so Vite bakes it in.
3. **Merge reports from main DPAL:** on the **API server**, set **`DPAL_UPSTREAM_URL`** to your main backend origin and **`DPAL_UPSTREAM_REPORTS_PATH`** to the path that returns a JSON array (or `{ reports | data | items }`). See `server/lib/upstream.mjs`. Put these in **`.env`** or **`.env.local`** in the project root (both are loaded when the API starts).
4. **Same backend for filings and feed:** the main app’s **`VITE_API_BASE`** (or equivalent) must be the **same origin** as **`DPAL_UPSTREAM_URL`**. Reports and images only appear after successful **`POST /api/reports`** (or anchor) to that backend. Relative image paths (`/api/assets/…`) are resolved against **`DPAL_UPSTREAM_URL`** so thumbnails load in the Validator UI.
5. **Hub “library” vs Validator:** the main app **hub** shows filings from **localStorage** plus whatever **`GET /api/reports/feed`** returns. The Validator **only** shows the **server** feed (plus audit data). Device-only drafts never appear in the Validator until they are posted to the API.
6. **Public “Open report” links:** set **`VITE_DPAL_PUBLIC_WEB_URL`** on Vercel to your DPAL web app origin (e.g. `https://your-dpal-front.vercel.app`), **or** set **`DPAL_PUBLIC_REPORT_BASE`** on the API server to the same (links are built as `?reportId=<id>`).

Saved reviewer entries are stored in **`server/data/reviewer-reviews.json`** on the API host (no per-user auth yet — add later).

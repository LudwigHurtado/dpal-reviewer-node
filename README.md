# DPAL Validator / Review-Node System

Premium enterprise **product concept** for DPAL: a **Validator / Review-Node Command Center** — trust, review, and accountability infrastructure for credentialed reviewers, legal and sector panels, regional truth-check teams, nonprofit partners, and senior QC.

This is **not** a social moderation or generic voting UI. It communicates structured validation, auditable histories, wallet-linked credentials, chain-anchored proofs (conceptual), and operational intelligence for administrators, analysts, legal teams, and validators.

## What’s in this repo

- React + Vite + TypeScript single-page dashboard
- Deep blue / graphite / silver palette with muted gold accents
- Sections: ecosystem roles, network map, report queues, escalations, reviewer performance, quality analytics, credentials, consensus tracker, conflict-of-interest alerts, regional coverage, category expertise, audit logs / chain proof samples, AI-assisted summary (advisory)

With the API running, queues and analytics come from **`server/data/dashboard.json`** and optional **upstream** report feeds; bundled mock data is only a **fallback** if the API is unreachable.

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

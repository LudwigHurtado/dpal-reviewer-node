# Contributing to DPAL Reviewer Node

Thanks for helping improve the Validator / Review-Node command center. This document is for **human** contributors; AI assistants should also read **`AGENTS.md`** and **`claude.md`**.

---

## What this project is

An enterprise-style **reviewer dashboard** (React + Vite + TypeScript) backed by a small **Node/Express** API. It is **not** a generic social moderation product — see **`README.md`** for the product framing.

**Repository:** [github.com/LudwigHurtado/dpal-reviewer-node](https://github.com/LudwigHurtado/dpal-reviewer-node)

---

## Development setup

1. **Clone** the repository.
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run API + UI together** (recommended):
   ```bash
   npm run dev:all
   ```
   - Vite dev server (default port from Vite, often `5173`).
   - API: `node server/index.mjs` — default **`8787`** (override with `REVIEWER_API_PORT`).
4. Open the URL printed in the terminal (typically `http://localhost:5173`).

**Windows:** If PowerShell blocks `npm`, run **`npm.cmd`** instead.

**UI only:** `npm run dev` — use when the API is already running elsewhere or you use mock data (`VITE_USE_MOCK_DATA=true` when supported).

---

## Environment variables

Copy **`.env.example`** to `.env` and adjust. Important groups:

- **`VITE_*`** — baked in at Vite build time; used in the browser.
- **`REVIEWER_API_PORT`** — local API port.
- **`DPAL_UPSTREAM_*`** — optional merge of reports from a main DPAL backend (`server/lib/upstream.mjs`).

Never commit real tokens or production secrets. Update **`.env.example`** when adding new variables (with comments, no real values).

---

## Checks before opening a PR

```bash
npm run lint    # TypeScript check (tsc --noEmit)
npm run build   # tsc + production Vite build
```

Fix any TypeScript errors. Keep changes **focused** on the issue or feature.

---

## Project layout (short)

```
server/           Express API, upstream helper, dashboard JSON
src/              React app, API client, hooks, types, components
public/           Static assets
vite.config.ts    Dev proxy /api → local API
```

---

## Deploy notes

Static builds output to **`dist/`**. For **Vercel** (or similar), the **Express API must be hosted separately** unless you use serverless adapters — set **`VITE_API_BASE_URL`** to the deployed API. See **`README.md`** and **`.env.example`**.

---

## Git & GitHub

- Use **`git`** for local commits, branches, rebases.
- Prefer **`gh`** (GitHub CLI) for PRs, issues, and repo operations on GitHub.com — see **`.cursor/rules/github-cli.mdc`** if present.
- Write clear commit messages and PR descriptions (what changed, why).

---

## Related repositories

- **`dpal-front-end`** — main public DPAL application (separate repo). Cross-cutting UX and routing notes live in **`claude.md`** in *this* repo for convenience.

---

## Questions

Open a GitHub **Discussion** or **Issue** on this repository, or follow your team’s usual channel.

# AGENTS — instructions for AI coding assistants (Cursor, Claude, etc.)

Read this file **first** when working in this workspace, then **`claude.md`** for deeper technical memory (especially cross-repo `dpal-front-end` details).

---

## Documentation map

| File | Purpose |
|------|---------|
| **`AGENTS.md`** (this file) | How to work here + **progress snapshot** — update when you finish meaningful work |
| **`claude.md`** | Long-form architecture, pitfalls, related repos, routing rules |
| **`CONTRIBUTING.md`** | Human contributors: setup, PRs, checks |
| **`README.md`** | Product overview, run/deploy |
| **`.env.example`** | All env vars (Vite + reviewer API + upstream) |
| **`.cursor/rules/github-cli.mdc`** | Use `gh` for GitHub.com; `git` for local |

---

## Repository identity

- **Name:** `dpal-reviewer-node`
- **GitHub:** `LudwigHurtado/dpal-reviewer-node`
- **What it is:** Validator / Review-Node **command center** — React + Vite + TypeScript UI with a small **Express** API (`server/index.mjs`). Dashboard data: `server/data/dashboard.json`; optional upstream merge via `DPAL_UPSTREAM_*` (see `server/lib/upstream.mjs`).

---

## Quick commands (this repo)

```bash
cd "C:\DPAL Reviewer Node"   # or your clone path
npm install
npm run dev:all              # API (default :8787) + Vite dev server
npm run lint                 # tsc --noEmit
npm run build                # tsc + vite build
```

- **Windows:** if `npm` fails in PowerShell, use **`npm.cmd`**.
- **Port 8787 in use:** set **`REVIEWER_API_PORT`** or stop the other process.
- Dev proxy: Vite sends **`/api`** → `VITE_DEV_API_PROXY_TARGET` or `http://127.0.0.1:8787` (`vite.config.ts`).

---

## Key paths (Reviewer Node)

| Area | Location |
|------|----------|
| API entry | `server/index.mjs` |
| Dashboard JSON | `server/data/dashboard.json` |
| Upstream helper | `server/lib/upstream.mjs` |
| Dashboard UI | `src/App.tsx`, `src/components/` |
| Typed API client | `src/api/client.ts` |
| Data hook | `src/hooks/useReviewerDashboard.ts` |
| Types | `src/types/reviewer.ts` |

---

## Deploy / env mental model

- **Full local dev:** run **`npm run dev:all`** so `/api` works through the proxy.
- **Static hosting (e.g. Vercel):** the **Express API is not on Vercel** unless you host it separately. Set **`VITE_API_BASE_URL`** to your deployed API origin (see `.env.example`).
- **Mock-only UI:** `VITE_USE_MOCK_DATA=true` (when wired) avoids calling the network.

---

## Related repo: `dpal-front-end` (not this workspace)

Typical path: **`C:\dpal-front-end`** · GitHub: **`LudwigHurtado/dpal-front-end`**

If the task touches the public DPAL shell, read **`claude.md`** § “Related app” before editing. Short reminders:

- **Never nest** `RouterProvider` / `MemoryRouter` / second `BrowserRouter` inside the app’s **`BrowserRouter`**. Good Wheels uses **`components/GoodWheelsStandaloneRoot.tsx`** (`createRoot` on a separate DOM node).
- **Return from Good Wheels:** `dpal-navigate` with `{ view: 'mainMenu', replaceHome: true }` resets URL/history.
- **URL ↔ view:** `utils/appRoutes.ts`; keep **`ALLOWED_APP_VIEWS`** in `utils/navSession.ts` aligned with `View` in `App.tsx`.
- **Lint:** `npm run lint` in `dpal-front-end` (often `tsc --noEmit`).

---

## Conventions

- Small, **task-focused** diffs; no drive-by refactors.
- **No secrets** in commits — use env vars and `.env.example`.
- Prefer **`gh`** for GitHub.com (PRs, issues, repo); **`git`** for add/commit/rebase locally.
- After substantive changes, bump **`## Progress log`** below and the date in **`claude.md`** if you edit it.

---

## Progress log (update when shipping meaningful changes)

| Date (UTC) | Area | Notes |
|------------|------|--------|
| 2026-04-04 | Reviewer UI + API | Live queue enrichment: upstream `publicUrl`/`location`; `DPAL_PUBLIC_REPORT_BASE`; `reviewer-reviews.json` + POST review; dashboard “Opinions & effects” panel + Open links via `VITE_DPAL_PUBLIC_WEB_URL`. |
| 2026-04-04 | Docs | Added `AGENTS.md`, `CONTRIBUTING.md`; expanded `claude.md` cross-links. |
| 2026-04 (prior) | `dpal-front-end` | Good Wheels: standalone React root + “Return to DPAL” bar + `replaceHome` URL reset; DPAL Lifts `onOpenGoodWheels`; `helpCenter` in `ALLOWED_APP_VIEWS`. |
| 2026-04 (prior) | `dpal-front-end` | Incident room: add-photo flow, merge images into report / filing gallery; routing flicker fixes; Material topic palette work. |
| 2026 (prior) | This repo | Express reviewer API, `dashboard.json`, upstream env, Vite proxy, typed client + hooks, Windows `dev-all` / port helpers. |

*Add a new row when you merge features or fix major behavior — the next chat should not guess.*

---

## If you are unsure

1. Read **`claude.md`** and **`README.md`**.  
2. Inspect **`server/index.mjs`** for live routes.  
3. Check **`.env.example`** for variable names.  

When work spans both repos, state which repo you changed in the progress log.

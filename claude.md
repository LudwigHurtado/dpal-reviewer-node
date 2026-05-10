# Claude / AI context — DPAL Reviewer Node & related work

This file is **handwritten project memory** for assistants: architecture, conventions, pitfalls, and related repos. **Also read `AGENTS.md`** for the documentation map and **progress log**.

**Last updated:** 2026-05-10

---

## Reviewer Node: Verifier Action Portal (this repo)

- **UI:** `src/components/VerifierPortal.tsx` — live queue, report detail, verification tab, outbound actions, routing reference, audit timeline. No validator map, fake consensus, or global situation-room browser (report-scoped work only).
- **Upstream:** **`DPAL_UPSTREAM_URL`** + **`DPAL_UPSTREAM_REPORTS_PATH=/api/reports/feed`**; detail via **`GET /api/reports/:id`** on the same host.
- **Verifier REST:** **`/api/reviewer/v1/verifier`** — `GET /reports`, `GET /reports/:id`, `GET /reports/:id/timeline`, `POST` notes / verify / request-evidence / actions. Local audit file **`server/data/verifier-audit.json`** until DB tables exist.
- **Legacy:** **`GET /api/reviewer/v1/dashboard`** and **SSE `/stream`** remain for older clients.
- **Production (Railway, this repo’s API service):** origin **`https://dpal-reviewer-node-production.up.railway.app`** — **`GET /api/reviewer/v1/health`**. Static UI **`VITE_API_BASE_URL`** should be **`https://dpal-reviewer-node-production.up.railway.app/api`**.

---

## Accounts, login, and where user names live (cross-repo)

This workspace does **not** host the main account system or primary filings API by itself. **Login UI** lives in **`dpal-front-end`**; the **HTTP API** this stack targets is **`dpal-front-end/backend`** (see that folder’s README and env), not **`dpal-ai-server`**.

| Piece | Location | Role |
|--------|----------|------|
| Sign-in / sign-up pages, session in the browser | **`dpal-front-end`** | `AppBootstrap.tsx` registers routes **before** the main `App` catch-all. |
| REST API (reports feed, filings, help/aux routes per deploy) | **`dpal-front-end/backend`** | Express + **Prisma** app under `backend/` in the front-end repo — what **`DPAL_UPSTREAM_URL`** should point at for queues/detail alignment. |

**Already implemented (high level)**

- **Login / registration:** same **`dpal-front-end`** routes (**`/login`**, **`/signup`**) and **`VITE_API_BASE`** pointing at whichever backend hosts **`/api/auth/*`** for your deployment (often the **`backend`** service origin).
- **Admin user lists / schema:** depend on how **`dpal-front-end/backend`** (and any shared auth service) is configured — see **`dpal-front-end/claude.md`** and **`dpal-front-end/backend`** docs rather than assuming Mongoose/`users` here.

**Ops notes**

- Auth secrets (**`JWT_SECRET`**, DB URLs, bootstrap admin email, etc.) are configured on the **backend** process you deploy from **`dpal-front-end/backend`**, not in this repo.
- **`VITE_API_BASE`** on the static app must match the origin that serves your filings + **`GET /api/reports/feed`** when wiring the public DPAL shell.

Front-end–specific URLs and env details are also in **`dpal-front-end/claude.md`**.

---

## This repository (`DPAL Reviewer Node`)

**Purpose:** **Verifier Action Portal** — React + Vite + TypeScript SPA and a small **Express** API for real report queues, verification, outbound action audit logs, and category playbooks (see `README.md`).

**GitHub:** `LudwigHurtado/dpal-reviewer-node` (use **`gh`** for GitHub operations when available; **`git`** for local history).

**Run locally**

- `npm install`
- **`npm run dev:all`** — runs API (`node server/index.mjs`, default port **8787**) and Vite together via `concurrently`.
- UI without upstream: the portal shows **demo** queue rows until **`DPAL_UPSTREAM_URL`** is set on the API.

**API / data**

- `server/index.mjs` — Express entry (legacy dashboard + **verifier** routes).
- `server/verifierRoutes.mjs` — **`/api/reviewer/v1/verifier/*`** (queue, detail, actions, timeline).
- `server/data/verifier-audit.json` — created at runtime for notes + action audit log.
- `server/data/dashboard.json` — legacy payload for **`GET /api/reviewer/v1/dashboard`** only.
- `server/lib/upstream.mjs` — **`DPAL_UPSTREAM_*`** feed + **`GET /api/reports/:id`** for detail.
- Vite proxies **`/api`** → `http://127.0.0.1:8787` in dev (`vite.config.ts`); override with **`VITE_DEV_API_PROXY_TARGET`**.
- Typical endpoints: **`GET /api/reviewer/v1/verifier/reports`**, **`GET /api/reviewer/v1/health`**.

**Frontend (this repo)**

- `src/App.tsx` → **`VerifierPortal`**, `src/api/verifierClient.ts`, `src/verifier/*`.
- Static deploy (e.g. Vercel): set **`VITE_API_BASE_URL`** to your hosted reviewer API origin + `/api`.

**Windows**

- Prefer **`npm.cmd`** if PowerShell blocks `npm.ps1`.
- Port **8787** busy: set **`REVIEWER_API_PORT`** or free the port (project may include `kill-port-8787.cmd`).

**Env reference:** `.env.example` (Vercel preview vs production notes are documented there).

---

## Related app: `dpal-front-end` (separate repo)

**Path on disk (typical):** `C:\dpal-front-end`  
**GitHub:** `LudwigHurtado/dpal-front-end`

Main **public** DPAL shell: many “views” driven by `currentView` in `App.tsx`, synced to URLs via **`utils/appRoutes.ts`** (`VIEW_PATHS`, `pathToView`, `viewToPath`).

**Routing discipline**

- **URL → view** effect reacts to `location.pathname` (and related) but **must not** depend on `currentView` (avoids fighting programmatic navigation / flicker).
- **View → URL** effect should depend only on **`currentView` + `navigate`**, not on every search/hash change (avoids deep-link flicker).
- Deep links on **`/`** with `?reportId=`, `?roomId=`, `?block=` etc. are special-cased so `/` does not blindly map to `mainMenu` while those resolve.

**Session / nav**

- `utils/navSession.ts` — `ALLOWED_APP_VIEWS` must stay aligned with `View` in `App.tsx` or restores get coerced to `mainMenu`. Includes **`helpCenter`** and **`dpalLifts`** among allowed ids.

**DPAL Lifts**

- View id: `dpalLifts`, path **`/lifts`**. `components/DpalLiftsView.tsx` — opens Good Wheels via **`onOpenGoodWheels`** from `App.tsx` (preferred over raw `window` events).

**DPAL Good Wheels (embedded)**

- Implemented under `src/good-wheels/` with **`RouterProvider`** / data router.
- **Do not** render `RouterProvider` (or `BrowserRouter` / `MemoryRouter`) **inside** the main app’s **`BrowserRouter`** — React Router throws: *You cannot render a `<Router>` inside another `<Router>`*.
- **Fix in use:** `components/GoodWheelsStandaloneRoot.tsx` mounts Good Wheels with **`createRoot()`** on a dedicated DOM node so the inner router is **not** a child of the outer `BrowserRouter`.
- **Return to main app:** sticky header with **Return to DPAL** dispatches `CustomEvent('dpal-navigate', { detail: { view: 'mainMenu', replaceHome: true } })`. `App.tsx` listens and, when `replaceHome` is set, runs **`navigate('/', { replace: true })`** so **`/good-wheels` does not remain** in the bar and history is replaced cleanly.

**Incident room / filings (recent feature work)**

- Situation chat can attach photos; on send, images merge into the report’s **`imageUrls`**, refresh selected report state, and persist for public lookup — see `mergeReportImageFromRoom` in `App.tsx` and `MissionChatroom.tsx`.
- **Filing imagery (situation room):** optional **`filingImageHistory`** on `Report` (append-only audit). UI: upload main image, multi-image gallery, “Set main”, **`VITE_INCIDENT_IMAGE_ADMIN=true`** for remove-from-gallery only (history kept). Implemented in `IncidentRoomView.tsx` + `App.tsx` (`handleFilingImageUpload`, `reorderFilingHeroToUrl`, `removeFilingGalleryImageAt`).

**Cell Mode / device preview (`dpal-front-end`)**

- `components/DevicePreviewFrame.tsx` — preview in iframe. **Fix:** when `window.self !== window.top`, render **only** `{children}` (no nested Cell Mode / no duplicate iframe) so preview is not blank. Flex children use **`minHeight: 0`** where needed to avoid clipping.

---

## `dpal-front-end/backend` — main DPAL API for this stack (not this repo)

**Where it lives:** inside the **`dpal-front-end`** repo, folder **`backend/`** — **Prisma**, help reports, **`GET /api/reports/feed`**, report routes as implemented there, optional **`geminiProxy`** (or similar) for local/auxiliary deploy. **Reviewer Node** sets **`DPAL_UPSTREAM_URL`** to this service’s **origin** (same host the hub uses for filings and feed when aligned).

**Historical note:** **`dpal-ai-server`** was an older Mongo-backed service; this stack assumes **`dpal-front-end/backend`** instead.

**Work locally:** clone **`dpal-front-end`**, follow **`backend`** README for install, Prisma migrate, and port. Production URL is whatever you deploy for that backend.

**AI / Gemini:** When **`VITE_USE_SERVER_AI`** is set, server routes such as **`/api/ai/gemini`** are expected on **`VITE_API_BASE`** — typically the **`backend`** deploy. Implementations live under **`dpal-front-end/backend`**, not in this repo.

**Gemini pitfall:** deprecated or wrong model names can return **404** from Google’s API — use env-driven model selection documented in the backend.

---

## `dpal-front-end` — Gemini: browser key vs server key

- **`isAiEnabled()`** (`services/geminiService.ts`): `Boolean(VITE_GEMINI_API_KEY) || (VITE_USE_SERVER_AI === "true")`.
- **`runGeminiGenerate()`:** if browser key exists → `@google/genai` in browser; else if **`VITE_USE_SERVER_AI`** → **`POST ${VITE_API_BASE}/api/ai/gemini`** (mount on **`dpal-front-end/backend`** when used).
- **`VITE_*`** is **public in the bundle** — to avoid shipping a browser Gemini key, put **`GEMINI_API_KEY`** on the **backend** deploy, set **`VITE_USE_SERVER_AI=true`**, and point **`VITE_API_BASE`** at that origin.
- **`constants.ts`:** `API_ROUTES.AI_GEMINI`, `API_ROUTES.AI_STATUS` — confirm paths against **`dpal-front-end/backend`** after route changes.

**Material / UI**

- User may reference KivyMD + Material rules for other DPAL clients; the web front end uses Tailwind + CSS variables / Material palette helpers (`utils/materialPalette.ts`, `styles/material-palettes.css`) where applicable.

---

## Conventions (from workspace + practice)

- Prefer **focused diffs**; do not refactor unrelated files.
- Avoid committing secrets; use `.env.example` and env vars.
- **Cursor rules:** GitHub CLI first for GitHub.com; `gh auth setup-git` for HTTPS without repeated prompts.

---

## Where to record progress

1. **`AGENTS.md`** — table **Progress log** (short, dated rows).
2. This file — bump **Last updated** and add bullets under **Related app** or **This repo** when architecture changes.

---

## What to add next

When you ship new env vars, API routes, or cross-repo contracts, append short bullets here or in **`AGENTS.md`** so the next session does not rediscover them from scratch. If auth or **`User`** schema changes, sync the **Accounts, login, and where user names live** section above and **`dpal-front-end/claude.md`**.

---

## Duplicate reference

Front-end–specific detail (env table, `API_ROUTES`, scripts) is also maintained in **`dpal-front-end/claude.md`** — update both when contracts change.

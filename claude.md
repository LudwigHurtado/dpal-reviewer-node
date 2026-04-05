# Claude / AI context — DPAL Reviewer Node & related work

This file is **handwritten project memory** for assistants: architecture, conventions, pitfalls, and related repos. **Also read `AGENTS.md`** for the documentation map and **progress log**.

**Last updated:** 2026-04-05

---

## Reviewer Node: Verifier Action Portal (this repo)

- **UI:** `src/components/VerifierPortal.tsx` — live queue, report detail, verification tab, outbound actions, routing reference, audit timeline. No validator map, fake consensus, or global situation-room browser (report-scoped work only).
- **Upstream:** **`DPAL_UPSTREAM_URL`** + **`DPAL_UPSTREAM_REPORTS_PATH=/api/reports/feed`**; detail via **`GET /api/reports/:id`** on the same host.
- **Verifier REST:** **`/api/reviewer/v1/verifier`** — `GET /reports`, `GET /reports/:id`, `GET /reports/:id/timeline`, `POST` notes / verify / request-evidence / actions. Local audit file **`server/data/verifier-audit.json`** until DB tables exist.
- **Legacy:** **`GET /api/reviewer/v1/dashboard`** and **SSE `/stream`** remain for older clients.

---

## Accounts, login, and where user names live (cross-repo)

This workspace does **not** host the main account system by itself. **Login UI** and **MongoDB-backed users** were added in:

| Piece | Repo | Role |
|--------|------|------|
| Sign-in / sign-up pages, session in the browser | **`dpal-front-end`** | `AppBootstrap.tsx` registers routes **before** the main `App` catch-all. |
| REST auth + `User` documents | **`dpal-ai-server`** | Express routes under **`/api/auth/*`**, admin **`/api/admin/*`**, Mongoose **`User`** model. |

**Already implemented**

- **Login screen:** open **`/login`** on the front-end app (e.g. local dev: `http://localhost:3000/login` with Vite’s configured port). Users sign in with **email or username** + password (`pages/auth/LoginPage.tsx`).
- **Registration:** **`/signup`** creates accounts; new users are stored in MongoDB (pending verification unless bootstrapped as admin — see below).
- **Database:** User **display name** and identifiers are stored in the **`users`** collection (Mongoose model **`User`**): **`fullName`** (required), **`username`**, **`email`**, plus **`role`**, **`status`**, **`emailVerified`**, **`lastLoginAt`**, etc. Passwords are **`passwordHash`** (not returned by API).
- **Seeing multiple users:** After logging in as an **admin**, **`/admin`** loads a paginated **Users** tab (`adminListUsers`) backed by **`GET /api/admin/users`** — names and roles appear there. Non-admins do not get a global user directory; they only see their own session via **`/account`** and **`/api/auth/me`**.

**Ops notes**

- **`BOOTSTRAP_ADMIN_EMAIL`** (on **`dpal-ai-server`**): if set, the **first signup** whose email matches (case-insensitive) gets **`admin`**, **`active`**, and **`emailVerified: true`** without waiting for email verification — useful to create the first operator account.
- **`JWT_SECRET`** (32+ characters) is **required in production** for access tokens; optional dev placeholder otherwise (`src/auth/tokens.ts`).
- Front-end must call the API that implements auth: set **`VITE_API_BASE`** to your **`dpal-ai-server`** origin (same host that mounts **`auth.routes.ts`** and **`admin.users.routes.ts`**). **`MONGODB_URI`** must be set on the server or registration/login returns **`database_unavailable`**.

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

## `dpal-ai-server` — main Railway API (not this repo)

**Canonical source of truth:** **[LudwigHurtado/dpal-ai-server](https://github.com/LudwigHurtado/dpal-ai-server)** on GitHub. Railway deploys from that repo’s **`main`** branch.

**Where to work locally:** use a **single** clone at **`C:\dpal-ai-server`** (or any path), **`git pull` / `git push`** only there. Do **not** maintain a second copy under `DPAL Reviewer Node\dpal-ai-server` for real edits—that nested folder was a historical duplicate and is easy to confuse with the canonical clone. This parent repo **ignores** `dpal-ai-server/` (see root `.gitignore`).

**Typical production URL:** `https://web-production-a27b.up.railway.app` (same host the front end targets with **`VITE_API_BASE`**).

This is the **Mongo-backed** Node/Express service (`src/index.ts`). **Do not confuse** with `dpal-front-end/backend/` (Prisma + help reports + optional `geminiProxy` for local/auxiliary deploy).

**AI routes (important):**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/ai/health` | Light check: `hasKey`, `model` — **works when GEMINI_API_KEY is set** |
| GET | `/api/ai/status` | `{ ok, gemini }` for **server-only AI** flag — added for `VITE_USE_SERVER_AI` flow |
| POST | `/api/ai/gemini` | Body `{ model, contents, config? }` — **@google/genai** on server (**`GEMINI_API_KEY` only on Railway**) |
| POST | `/api/ai/ask` | Text ask; `tier: "cheap"` uses **`cheapModel()`** |

**Gemini model pitfall (fixed 2026-04):** Google API **no longer serves `gemini-1.5-flash`** on v1beta (404). Defaults now use **`GEMINI_MODEL`**, optional **`GEMINI_MODEL_CHEAP`**, or fallback **`gemini-2.0-flash`**. Triage JSON parsing hardened if the model returns non-JSON.

**NFT / persona images (REST):** Native image models require **`generationConfig.responseModalities: ["TEXT", "IMAGE"]`** in the request (see [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation)). `src/services/gemini.service.ts` implements that plus a **model fallback chain**; optional **`GEMINI_IMAGE_MODEL`** overrides the first try.

**Verify production:** `GET {API_BASE}/health` → `dpal-ai-server`. `GET {API_BASE}/api/ai/health` → `hasKey: true` if key is set. **`/api/ai/status`** and **`/api/ai/gemini`** require a deploy that includes those handlers; if **`/api/ai/status` returns 404**, redeploy **`dpal-ai-server`** from latest `main` or confirm Railway is connected to that repo.

**Automated check (2026-04-05):** `GET /api/ai/health` on this host returned **`hasKey: true`**, **`model: gemini-3-flash-preview`**. **`GET /api/ai/status`** still returned **404** — production build likely **not** on latest `main` yet; after redeploy, expect **`{"ok":true,"gemini":true}`** when **`GEMINI_API_KEY`** is set.

---

## `dpal-front-end` — Gemini: browser key vs server key

- **`isAiEnabled()`** (`services/geminiService.ts`): `Boolean(VITE_GEMINI_API_KEY) || (VITE_USE_SERVER_AI === "true")`.
- **`runGeminiGenerate()`:** if browser key exists → `@google/genai` in browser; else if **`VITE_USE_SERVER_AI`** → **`POST ${VITE_API_BASE}/api/ai/gemini`**.
- **`VITE_*`** is **public in the bundle** — to **remove** `VITE_GEMINI_API_KEY` from Vercel: set **`GEMINI_API_KEY`** on Railway, **`VITE_USE_SERVER_AI=true`** on Vercel, **`VITE_API_BASE`** = Railway URL, **redeploy both**; then remove browser key and redeploy front end.
- **`constants.ts`:** `API_ROUTES.AI_GEMINI`, `API_ROUTES.AI_STATUS` for the proxy paths.

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

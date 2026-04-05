# Claude / AI context — DPAL Reviewer Node & related work

This file is **handwritten project memory** for assistants: architecture, conventions, pitfalls, and related repos. **Also read `AGENTS.md`** for the documentation map and **progress log**.

**Last updated:** 2026-04-05

---

## This repository (`DPAL Reviewer Node`)

**Purpose:** Validator / Review-Node **command center** — React + Vite + TypeScript SPA backed by a small **Express** API. Not generic social moderation; focused on structured validation, queues, credentials, audit-style UX (see `README.md`).

**GitHub:** `LudwigHurtado/dpal-reviewer-node` (use **`gh`** for GitHub operations when available; **`git`** for local history).

**Run locally**

- `npm install`
- **`npm run dev:all`** — runs API (`node server/index.mjs`, default port **8787**) and Vite together via `concurrently`.
- UI-only or mock: `npm run dev` with `VITE_USE_MOCK_DATA=true` if configured.

**API / data**

- `server/index.mjs` — Express entry.
- `server/data/dashboard.json` — primary dashboard payload; replace or pipeline-sync for real data.
- `server/lib/upstream.mjs` — optional **`DPAL_UPSTREAM_*`** env merge of reports from a main DPAL backend (see `.env.example`).
- Vite proxies **`/api`** → `http://127.0.0.1:8787` in dev (`vite.config.ts`); override with **`VITE_DEV_API_PROXY_TARGET`**.
- Typical endpoints: `GET /api/reviewer/v1/dashboard`, `reports`, `health` (confirm in `server/index.mjs`).

**Frontend (this repo)**

- `src/App.tsx`, `src/api/client.ts`, `src/hooks/useReviewerDashboard.ts`, `src/types/reviewer.ts`.
- Static deploy (e.g. Vercel): no `/api` unless you host the Express app elsewhere and set **`VITE_API_BASE_URL`** to that origin’s API base.

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

When you ship new env vars, API routes, or cross-repo contracts, append short bullets here or in **`AGENTS.md`** so the next session does not rediscover them from scratch.

---

## Duplicate reference

Front-end–specific detail (env table, `API_ROUTES`, scripts) is also maintained in **`dpal-front-end/claude.md`** — update both when contracts change.

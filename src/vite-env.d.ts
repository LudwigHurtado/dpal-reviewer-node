/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string | undefined;
  /** When set, static demo data is used and no HTTP calls are made. */
  readonly VITE_USE_MOCK_DATA: string | undefined;
  /** Optional Bearer token for authenticated reviewer APIs. */
  readonly VITE_API_BEARER_TOKEN: string | undefined;
  /**
   * Public DPAL web app origin for “Open report” links when the API did not set `publicUrl`
   * (e.g. `https://your-dpal-app.vercel.app` — link becomes `/?reportId=…`).
   */
  readonly VITE_DPAL_PUBLIC_WEB_URL: string | undefined;
  /** When not `false`, connect to `/api/reviewer/v1/stream` for live queue updates (SSE). */
  readonly VITE_REVIEWER_USE_SSE: string | undefined;
  /** Poll interval in ms when SSE is off or failed (default 15000). */
  readonly VITE_REVIEWER_POLL_MS: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

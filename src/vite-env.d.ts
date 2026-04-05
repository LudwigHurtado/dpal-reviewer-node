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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

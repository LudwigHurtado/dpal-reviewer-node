/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string | undefined;
  /** When set, static demo data is used and no HTTP calls are made. */
  readonly VITE_USE_MOCK_DATA: string | undefined;
  /** Optional Bearer token for authenticated reviewer APIs. */
  readonly VITE_API_BEARER_TOKEN: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

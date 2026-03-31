/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. http://127.0.0.1:3001 — overrides dev default for API calls */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

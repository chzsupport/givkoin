/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FRONTEND_URL?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

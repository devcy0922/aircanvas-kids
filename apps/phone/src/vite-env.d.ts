/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RELAY_BASE?: string;
  readonly VITE_CONTENT_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

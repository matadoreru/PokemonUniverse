/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_REALTIME?: 'node' | 'java';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

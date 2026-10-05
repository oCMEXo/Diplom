/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_COLLAB_URL: string;
  /** Where terminals connect (the runner): "http://localhost:3003", or "/terminal" behind one address. */
  readonly VITE_TERMINAL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_COLLAB_URL: string;
  /** "false" hides running code (the public test host does not run visitors' programs). */
  readonly VITE_RUN_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

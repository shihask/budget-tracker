/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SENTRY_DSN?: string
  /** 'true' turns on guest mode (see GUEST_MODE_ENABLED in src/lib/guest.ts). */
  readonly VITE_GUEST_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

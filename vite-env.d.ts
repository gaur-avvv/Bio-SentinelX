
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_MAPPLS_TOKEN: string;
  readonly VITE_BIOSENTINEL_API: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

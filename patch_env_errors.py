import os
from pathlib import Path

# Fix the import.meta.env TS errors by ensuring vite-env.d.ts is loaded or we cast it properly
# Alternatively, since vite allows import.meta.env, we can just add a global declaration

vite_env = """
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
"""

if not os.path.exists("vite-env.d.ts"):
    with open("vite-env.d.ts", "w") as f:
        f.write(vite_env)

# also need to make sure tsconfig includes it
with open('tsconfig.json', 'r') as f:
    tsconfig = f.read()

if "vite-env.d.ts" not in tsconfig:
    tsconfig = tsconfig.replace('"include": ["src"', '"include": ["src", "vite-env.d.ts"')
    with open('tsconfig.json', 'w') as f:
        f.write(tsconfig)

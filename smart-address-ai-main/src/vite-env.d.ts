/// <reference types="vite/client" />

declare const __DEPLOY_REVISION__: string;
declare const __CLERK_STUB__: boolean;

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  readonly VITE_PARSER_API_URL?: string;
  readonly VITE_SKIP_CLERK?: string;
  readonly VITE_DEV_PARSER_MAX_LINES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}

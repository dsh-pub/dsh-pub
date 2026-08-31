/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_GA_MEASUREMENT_ID?: string;
  readonly PUBLIC_ADSENSE_CLIENT_ID?: string;
  readonly PUBLIC_ADSENSE_SLOT_DETAIL?: string;
  readonly PUBLIC_ADSENSE_SLOT_CATALOG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

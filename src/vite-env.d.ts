/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** White-label overrides — see `src/theme/brand.ts`. */
  readonly VITE_BRAND_PRODUCT_NAME?: string
  readonly VITE_BRAND_PRODUCT_INITIALS?: string
  readonly VITE_BRAND_VENDOR_NAME?: string
  readonly VITE_BRAND_VENDOR_URL?: string
  readonly VITE_BRAND_ACCENT?: string
  readonly VITE_BRAND_TAGLINE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

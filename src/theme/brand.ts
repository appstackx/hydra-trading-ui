/**
 * White-label configuration.
 *
 * Product name, vendor and accent colour are read from build-time environment
 * variables, so one codebase produces a differently-branded bundle per licensee
 * without a fork. Anything not supplied falls back to the Appstackx reference
 * build.
 */

export interface Brand {
  /** Name shown in the title bar and the document title. */
  readonly productName: string
  /** Short form used where space is tight. */
  readonly productInitials: string
  readonly vendorName: string
  readonly vendorUrl: string
  /**
   * Accent colour applied at runtime as `--color-brand`. Any CSS colour.
   * Leave unset to keep the compiled-in default.
   */
  readonly accent: string | undefined
  readonly tagline: string
}

const env = import.meta.env

export const BRAND: Brand = {
  productName: env.VITE_BRAND_PRODUCT_NAME ?? 'Hydra Terminal',
  productInitials: env.VITE_BRAND_PRODUCT_INITIALS ?? 'HX',
  vendorName: env.VITE_BRAND_VENDOR_NAME ?? 'Appstackx',
  vendorUrl: env.VITE_BRAND_VENDOR_URL ?? 'https://appstackx.co.uk',
  accent: env.VITE_BRAND_ACCENT,
  tagline: env.VITE_BRAND_TAGLINE ?? 'FX trading & order management',
}

/**
 * Applies the licensee's accent colour to the document.
 *
 * Called once at start-up. Every accent-coloured surface in the app reads
 * `--color-brand`, so this single write re-skins the product.
 */
export function applyBrand(
  brand: Brand = BRAND,
  root: HTMLElement | null = document.documentElement
): void {
  if (!root || brand.accent === undefined || brand.accent === '') return
  root.style.setProperty('--color-brand', brand.accent)
}

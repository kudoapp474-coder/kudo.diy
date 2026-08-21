/**
 * Build-time compatibility for the Vercel deployment.
 *
 * The primary Sites runtime injects real Cloudflare D1 and R2 bindings through
 * `cloudflare:workers`. Vercel does not expose that module, so its Next.js build
 * resolves the import to this inert environment. Public pages and routes that
 * do not use D1/R2 continue to work. Data and upload routes return their normal
 * setup/runtime errors until equivalent Vercel storage is configured.
 */
export const env = {
  DB: undefined,
  BUCKET: undefined,
};

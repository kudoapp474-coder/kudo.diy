/**
 * Vercel build-time compatibility for Cloudflare bindings.
 *
 * The real binding is supplied by the Cloudflare/Sites runtime. Vercel does
 * not provide D1 or R2, so API handlers can detect an absent binding instead
 * of failing while Next.js collects route metadata.
 */
export const env: {
  DB?: D1Database;
  BUCKET?: R2Bucket;
} = {};

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
  }
}

declare module "kodo-runtime-env" {
  export const env: {
    DB: D1Database;
    BUCKET: R2Bucket;
  };
}

declare module "*.png" {
  const source: import("next/image").StaticImageData;
  export default source;
}

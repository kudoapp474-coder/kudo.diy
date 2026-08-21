import type { NextConfig } from "next";

const isVercelBuild =
  process.env.VERCEL === "1" || process.env.KODO_VERCEL_BUILD === "1";

const nextConfig: NextConfig = isVercelBuild
  ? {
      turbopack: {
        resolveAlias: {
          "cloudflare:workers": "./lib/vercel-cloudflare-shim.ts",
        },
      },
    }
  : {};

export default nextConfig;

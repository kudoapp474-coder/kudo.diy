import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias["kodo-runtime-env"] = path.resolve(
      process.cwd(),
      "lib/cloudflare-workers-vercel.ts",
    );
    return config;
  },
};

export default nextConfig;

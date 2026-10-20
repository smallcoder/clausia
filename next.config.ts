import type { NextConfig } from "next";

// cacheComponents is off on purpose: every screen is per-user, dynamic data behind RLS.
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["pdf-lib"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

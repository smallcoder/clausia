import type { NextConfig } from "next";

// cacheComponents is off on purpose: every screen is per-user, dynamic data behind RLS.
const nextConfig: NextConfig = {
  cacheComponents: false,
  serverExternalPackages: ["pdf-lib"],
  experimental: { serverActions: { bodySizeLimit: "25mb" } },
  // the morning brief lives in the chat only (one-home rule): the old /brief page (and ?date=) opens Home
  async redirects() {
    return [{ source: "/brief", destination: "/", permanent: false }];
  },
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

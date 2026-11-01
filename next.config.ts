import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents bewusst aus: fast alle Seiten sind authentifiziert & dynamisch.
  // Siehe docs/superpowers/specs/2026-11-01-happyfeet-grundgeruest-design.md
  experimental: {
    serverActions: {
      // 10 Bilder à max. 10 MB + Multipart-Overhead (siehe POST_LIMITS in src/lib/domain/posts.ts)
      bodySizeLimit: "105mb",
    },
    // Der Proxy (Clerk) puffert Request-Bodies – Standard 10 MB würde Uploads abschneiden.
    proxyClientMaxBodySize: "105mb",
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

import type { NextConfig } from "next";

/**
 * Sicherheits-Header für jede Antwort. Kein Einbetten in fremde Seiten (Clickjacking auf „Kündigen“, Admin-Aktionen,
 * Checkout): `X-Frame-Options` für ältere Browser plus CSP `frame-ancestors`. Bewusst (noch) keine volle Script-CSP –
 * Clerk lädt Skripte von eigener Domain; die gehört mit Nonces zum Launch (siehe README-Checkliste).
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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

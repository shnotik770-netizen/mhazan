import type { NextConfig } from "next";

// Baseline security headers flagged missing by the israeli-appsec-scanner
// skill's A05 (Security Misconfiguration) checklist — none of these were set
// anywhere before. Content-Security-Policy is deliberately left out: a wrong
// CSP can silently break the app (blocked scripts/styles) in ways that are
// easy to miss without testing every page, so it needs its own careful pass
// rather than being guessed here. The app has no iframe-embedding or
// camera/mic/geolocation use anywhere (confirmed by grep), so DENY/none are
// safe defaults, not placeholders to revisit.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Safe even though the app only binds plain HTTP internally — Railway
  // terminates TLS at its edge, and this header only ever takes effect once
  // the browser has already received a response over a real HTTPS
  // connection (the public domain), telling it to require HTTPS next time.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

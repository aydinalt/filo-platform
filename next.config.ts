import type { NextConfig } from "next";

const supabaseOrigin = (() => {
  try { const value = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || ""); return value.protocol === "https:" ? value.origin : ""; }
  catch { return ""; }
})();
const connectSources = ["'self'", "https://challenges.cloudflare.com", supabaseOrigin].filter(Boolean).join(" ");
const buildIdentity = (
  process.env.GITHUB_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  "filo-1-28-20"
).replace(/[^a-zA-Z0-9_-]/g, "-");

const nextConfig: NextConfig = {
  deploymentId: buildIdentity,
  generateBuildId: async () => buildIdentity,
  serverExternalPackages: ["postgres"],
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self)" },
      { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.openstreetmap.org; connect-src ${connectSources}; frame-src https://www.openstreetmap.org https://challenges.cloudflare.com` },
    ] }];
  },
};

export default nextConfig;

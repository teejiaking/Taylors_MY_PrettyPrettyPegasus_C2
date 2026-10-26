import type { NextConfig } from "next";
const config: NextConfig = {
  distDir:
    // Vercel's Next.js adapter expects the standard build output directory.
    process.env.VERCEL === "1"
      ? ".next"
      : process.env.NODE_ENV === "production"
        ? process.env.AUTH_MODE === "supabase"
          ? ".next-supabase"
          : ".next-production"
        : ".next",
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/trustvault-postgres",
    "@tidecloak/nextjs",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
    ];
  },
};
export default config;

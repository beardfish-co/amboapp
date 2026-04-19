import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure the Catena JSON data files are bundled into the serverless function
  // at runtime. Next.js's file-tracing doesn't follow paths built from
  // process.cwd(), so include them explicitly.
  outputFileTracingIncludes: {
    "/api/catena": ["./data/catena/**/*.json"],
  },
};

export default nextConfig;

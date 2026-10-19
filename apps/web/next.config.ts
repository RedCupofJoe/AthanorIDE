import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@athanor/contracts", "@athanor/node-definitions"],
  async rewrites() {
    const internalApiUrl = process.env.ATHANOR_INTERNAL_API_URL;
    if (!internalApiUrl) return [];
    return [{ source: "/api/:path*", destination: `${internalApiUrl}/api/:path*` }];
  },
};

export default nextConfig;

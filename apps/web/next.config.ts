import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@athanor/contracts", "@athanor/node-definitions"],
};

export default nextConfig;

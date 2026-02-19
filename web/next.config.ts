import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["react-markdown", "remark-gfm"],
};

export default nextConfig;

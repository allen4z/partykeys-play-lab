import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for OSS + CDN hosting (aliyun).
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;

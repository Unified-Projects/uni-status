import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_UNI_STATUS_URL: process.env.UNI_STATUS_URL,
    NEXT_PUBLIC_APP_URL: process.env.UNI_STATUS_URL,
    NEXT_PUBLIC_API_URL: process.env.UNI_STATUS_URL ? `${process.env.UNI_STATUS_URL}/api` : undefined,
  },
  transpilePackages: [
    "@uni-status/ui",
    "@uni-status/shared",
    "@uni-status/auth",
    "@uni-status/database",
    "@uni-status/email",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

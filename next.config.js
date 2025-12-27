/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true, // ← ВАЖНО
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.cloudflare.steamstatic.com",
        pathname: "/apps/dota2/images/**",
      },
    ],
  },
};

module.exports = nextConfig;

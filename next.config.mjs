/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "help.yeastar.com" },
      { protocol: "https", hostname: "integrazione.voispeed.com" },
    ],
  },
}

export default nextConfig

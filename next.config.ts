import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },

  images: {
    remotePatterns: [],
  },

  // Ignore TypeScript errors during production build
  typescript: {
    ignoreBuildErrors: true,
  },

  // Ignore ESLint errors during production build
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig
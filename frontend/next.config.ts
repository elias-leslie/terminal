import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Proxy /api/* to backend server-to-server to avoid CORS issues with CF Access
  // In production: browser requests terminal.summitflow.dev/api/* (same-origin)
  // Next.js rewrites proxy to localhost:8002 (server-to-server, no CORS)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8002/api/:path*',
      },
    ]
  },
}

export default nextConfig

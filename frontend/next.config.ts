import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Proxy /api/* and /ws/* to backend server-to-server to avoid CORS issues with CF Access
  // In production: browser requests terminal.summitflow.dev/api/* (same-origin)
  // Next.js rewrites proxy to localhost:8002 (server-to-server, no CORS)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8002/api/:path*',
      },
      // WebSocket paths - same-origin routing for CF Access compatibility
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8002/ws/:path*',
      },
    ]
  },
}

export default nextConfig

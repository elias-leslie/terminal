import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // API routing is handled client-side via lib/api-config.ts
  // No rewrites needed - buildApiUrl() resolves to correct backend URL
  // based on window.location (localhost for dev, terminalapi.summitflow.dev for prod)
}

export default nextConfig

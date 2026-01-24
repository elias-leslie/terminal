/**
 * API configuration for Terminal frontend.
 *
 * Uses same-origin routing via Next.js rewrites to avoid CORS issues with CF Access:
 * - Development: http://localhost:3002/api/* -> localhost:8002/api/* (rewrite)
 * - Production: https://terminal.summitflow.dev/api/* -> localhost:8002/api/* (rewrite)
 *
 * This pattern ensures all API requests go through the same origin as the frontend,
 * with Next.js server-side proxying to the backend. No cross-origin = no CORS.
 */

const PORTS = { frontend: 3002, backend: 8002 }
const PROD_DOMAIN = 'terminal.summitflow.dev'

/**
 * Get the base URL for Terminal backend API calls.
 *
 * Returns empty string for client-side (same-origin via rewrites) or localhost for server-side.
 *
 * @returns Base URL (empty for client-side same-origin, full URL for server-side)
 */
export function getApiBaseUrl(): string {
  // Server-side: use localhost directly (for server components, API routes)
  if (typeof window === 'undefined') {
    return `http://localhost:${PORTS.backend}`
  }

  // Client-side: use same-origin paths (Next.js rewrites handle proxying)
  // All requests go to /api/* on current origin, rewrites proxy to backend
  return ''
}

/**
 * Get WebSocket URL for a given path.
 *
 * Automatically handles ws/wss based on current protocol.
 *
 * IMPORTANT: In production, WebSocket uses same-origin routing via Cloudflare Tunnel
 * path-based rules. This avoids CF Access cookie issues (cookies are subdomain-specific).
 * The Tunnel config routes /ws/* paths directly to the backend.
 *
 * @param path - WebSocket path (e.g., /ws/terminal/session-id)
 * @returns Full WebSocket URL
 */
export function getWsUrl(path: string): string {
  if (typeof window === 'undefined') {
    return `ws://localhost:${PORTS.backend}${path}`
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const host = window.location.hostname

  // Development
  if (host === 'localhost' || host === '127.0.0.1') {
    return `ws://localhost:${PORTS.backend}${path}`
  }

  // Production: use same-origin WebSocket via Cloudflare Tunnel path routing
  // Tunnel config routes /ws/* paths directly to backend, avoiding CF Access cookie issues
  if (host === PROD_DOMAIN) {
    return `${protocol}//${PROD_DOMAIN}${path}`
  }

  // Fallback
  return `ws://localhost:${PORTS.backend}${path}`
}

/**
 * Build a full API URL from a path.
 *
 * @param path - API path (e.g., /api/terminal/sessions)
 * @returns Full URL
 */
export function buildApiUrl(path: string): string {
  return `${getApiBaseUrl()}${path}`
}

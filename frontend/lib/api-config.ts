/**
 * API configuration for Terminal frontend.
 *
 * Provides consistent URL resolution for:
 * - Development (localhost:8002)
 * - Production (terminalapi.summitflow.dev)
 *
 * This pattern is self-contained - no external dependencies required.
 */

const PORTS = { frontend: 3002, backend: 8002 }
const PROD_DOMAIN = 'terminal.summitflow.dev'
const PROD_API_DOMAIN = 'terminalapi.summitflow.dev'

/**
 * Get the base URL for Terminal backend API calls.
 *
 * @returns Full URL (e.g., http://localhost:8002 or https://terminalapi.summitflow.dev)
 */
export function getApiBaseUrl(): string {
  // Server-side: always use localhost
  if (typeof window === 'undefined') {
    return `http://localhost:${PORTS.backend}`
  }

  const host = window.location.hostname

  // Development: localhost or 127.0.0.1
  if (host === 'localhost' || host === '127.0.0.1') {
    return `http://localhost:${PORTS.backend}`
  }

  // Production: terminal.summitflow.dev -> terminalapi.summitflow.dev
  if (host === PROD_DOMAIN) {
    return `https://${PROD_API_DOMAIN}`
  }

  // Fallback: use localhost (shouldn't happen in normal use)
  return `http://localhost:${PORTS.backend}`
}

/**
 * Get WebSocket URL for a given path.
 *
 * Automatically handles ws/wss based on current protocol.
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

  // Production
  if (host === PROD_DOMAIN) {
    return `${protocol}//${PROD_API_DOMAIN}${path}`
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

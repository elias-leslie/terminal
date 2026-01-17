'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Poll interval for Claude state check (500ms) */
export const CLAUDE_POLL_INTERVAL_MS = 500

/** Max time to poll before giving up (15 seconds - slightly longer than backend verify) */
export const CLAUDE_POLL_TIMEOUT_MS = 15000

interface UseClaudePollingReturn {
  /** Start Claude in a session and poll for confirmation */
  startClaude: (sessionId: string) => Promise<boolean>
  /** Whether polling is currently active */
  isPolling: boolean
  /** Stop any active polling */
  stopPolling: () => void
}

/** Helper: delay for specified ms */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Hook for starting Claude in a terminal session and polling for state changes.
 *
 * Uses async/await polling loop instead of setInterval for cleaner cleanup.
 *
 * Handles:
 * - Starting Claude via API
 * - Polling for "starting" -> "running" or "error" transition
 * - Timeout after 10 seconds
 * - Cache invalidation via react-query
 *
 * @example
 * ```tsx
 * const { startClaude, isPolling, stopPolling } = useClaudePolling();
 *
 * const handleStartClaude = async () => {
 *   const success = await startClaude(sessionId);
 *   if (success) {
 *     console.log("Claude started successfully");
 *   }
 * };
 * ```
 */
export function useClaudePolling(): UseClaudePollingReturn {
  const queryClient = useQueryClient()
  const abortControllerRef = useRef<AbortController | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  // Stop any active polling
  const stopPolling = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setIsPolling(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // Poll for Claude state using async/await loop
  const pollForClaudeState = useCallback(
    async (sessionId: string): Promise<void> => {
      // Clear any existing polling
      stopPolling()

      const controller = new AbortController()
      abortControllerRef.current = controller
      setIsPolling(true)

      const pollStart = Date.now()

      while (!controller.signal.aborted) {
        // Check timeout
        if (Date.now() - pollStart > CLAUDE_POLL_TIMEOUT_MS) {
          // Timeout - always invalidate to sync state from backend
          queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
          break
        }

        // Wait before checking
        await delay(CLAUDE_POLL_INTERVAL_MS)

        // Check if aborted during delay
        if (controller.signal.aborted) break

        // Fetch latest state
        try {
          const stateRes = await fetch(
            `/api/terminal/sessions/${sessionId}/claude-state`,
            {
              signal: controller.signal,
            },
          )
          if (stateRes.ok) {
            const stateData = await stateRes.json()
            if (
              stateData.claude_state === 'running' ||
              stateData.claude_state === 'error'
            ) {
              // Invalidate to update UI
              queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
              break
            }
          }
        } catch (e) {
          // Ignore AbortError, break on other errors
          if (e instanceof Error && e.name === 'AbortError') break
        }
      }

      // Always invalidate on exit to ensure state sync
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
      setIsPolling(false)
      abortControllerRef.current = null
    },
    [queryClient, stopPolling],
  )

  // Start Claude in a session and poll for confirmation
  const startClaude = useCallback(
    async (sessionId: string): Promise<boolean> => {
      try {
        const res = await fetch(
          `/api/terminal/sessions/${sessionId}/start-claude`,
          {
            method: 'POST',
          },
        )

        if (!res.ok) {
          console.error('Failed to start Claude:', await res.text())
          return false
        }

        const data = await res.json()

        // Invalidate sessions query to pick up new claude_state
        queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })

        // If Claude is starting, poll for completion (non-blocking)
        if (data.claude_state === 'starting') {
          // Fire and forget - don't await
          pollForClaudeState(sessionId)
        }

        // Return true if started or already running
        return data.started || data.message?.includes('already running')
      } catch (e) {
        console.error('Failed to start Claude:', e)
        return false
      }
    },
    [queryClient, pollForClaudeState],
  )

  return {
    startClaude,
    isPolling,
    stopPolling,
  }
}

"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Poll interval for Claude state check (500ms) */
export const CLAUDE_POLL_INTERVAL_MS = 500;

/** Max time to poll before giving up (10 seconds) */
export const CLAUDE_POLL_TIMEOUT_MS = 10000;

interface UseClaudePollingReturn {
  /** Start Claude in a session and poll for confirmation */
  startClaude: (sessionId: string) => Promise<boolean>;
  /** Whether polling is currently active */
  isPolling: boolean;
  /** Stop any active polling */
  stopPolling: () => void;
}

/**
 * Hook for starting Claude in a terminal session and polling for state changes.
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
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Stop any active polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Start Claude in a session and poll for confirmation
  const startClaude = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/start-claude`, {
        method: "POST",
      });

      if (!res.ok) {
        console.error("Failed to start Claude:", await res.text());
        return false;
      }

      const data = await res.json();

      // Invalidate sessions query to pick up new claude_state
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });

      // If Claude is starting, poll for completion
      if (data.claude_state === "starting") {
        // Clear any existing polling interval
        stopPolling();

        // Poll until Claude is running (or timeout)
        const pollStart = Date.now();
        setIsPolling(true);

        pollIntervalRef.current = setInterval(async () => {
          if (Date.now() - pollStart > CLAUDE_POLL_TIMEOUT_MS) {
            stopPolling();
            return;
          }

          // Fetch latest state
          try {
            const stateRes = await fetch(`/api/terminal/sessions/${sessionId}/claude-state`);
            if (stateRes.ok) {
              const stateData = await stateRes.json();
              if (stateData.claude_state === "running" || stateData.claude_state === "error") {
                stopPolling();
                // Invalidate to update UI
                queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
              }
            }
          } catch {
            // Ignore fetch errors during polling
          }
        }, CLAUDE_POLL_INTERVAL_MS);
      }

      // Return true if started or already running
      return data.started || data.message?.includes("already running");
    } catch (e) {
      console.error("Failed to start Claude:", e);
      return false;
    }
  }, [queryClient, stopPolling]);

  return {
    startClaude,
    isPolling,
    stopPolling,
  };
}

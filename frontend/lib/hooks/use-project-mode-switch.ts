'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { type MutableRefObject, useCallback } from 'react'
import { useClaudePolling } from './use-claude-polling'
import type { TerminalPane } from './use-terminal-panes'
import type { TerminalSession } from './use-terminal-sessions'

/** Pane list response type for query cache access */
interface PaneListResponse {
  items: TerminalPane[]
  total: number
  max_panes: number
}

/** Delay for tmux session initialization */
const _TMUX_INIT_DELAY_MS = 300

/** Delay before scrolling tab into view */
const TAB_SCROLL_DELAY_MS = 100

interface SwitchProjectModeParams {
  projectId: string
  mode: 'shell' | 'claude'
  /** All sessions for this project */
  projectSessions: TerminalSession[]
  rootPath: string | null
  /** Pane ID if available (for direct pane mode switching) */
  paneId?: string
}

interface UseProjectModeSwitchOptions {
  /** Function to switch mode in backend (from useProjectTerminals) */
  switchMode: (projectId: string, mode: 'shell' | 'claude') => Promise<void>
  /** Refs to project tabs for scroll-into-view */
  projectTabRefs: MutableRefObject<Map<string, HTMLDivElement>>
  /** Panes array (new architecture) */
  panes: TerminalPane[]
  /** Function to set active mode on a pane */
  setActiveMode: (
    paneId: string,
    mode: 'shell' | 'claude',
  ) => Promise<TerminalPane>
}

interface UseProjectModeSwitchReturn {
  /** Switch project mode with full orchestration */
  switchProjectMode: (params: SwitchProjectModeParams) => Promise<void>
  /** Whether polling is currently active */
  isPolling: boolean
}

/**
 * Hook for orchestrating project mode switches (shell <-> claude).
 *
 * Handles the 6-step orchestration:
 * 1. Update backend mode
 * 2. Determine/create target session
 * 3. Check Claude state (if switching to claude)
 * 4. Start Claude and poll for confirmation
 * 5. Navigate to session via URL
 * 6. Scroll tab into view
 *
 * @example
 * ```tsx
 * const { switchProjectMode } = useProjectModeSwitch({
 *   switchMode,
 *   projectTabRefs,
 * });
 *
 * // In mode dropdown handler:
 * await switchProjectMode({
 *   projectId: "my-project",
 *   mode: "claude",
 *   projectSessions: [...], // all sessions for this project
 *   rootPath: "/home/user/project",
 * });
 * ```
 */
export function useProjectModeSwitch({
  switchMode,
  projectTabRefs,
  panes,
  setActiveMode,
}: UseProjectModeSwitchOptions): UseProjectModeSwitchReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Claude polling hook for starting Claude and polling for state changes
  const { startClaude, isPolling } = useClaudePolling()

  // Helper to update URL with session param
  const navigateToSession = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('session', sessionId)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  // Helper to start Claude in a session and wait for confirmation
  const startClaudeInSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      return startClaude(sessionId)
    },
    [startClaude],
  )

  // Main orchestration function
  const switchProjectMode = useCallback(
    async (params: SwitchProjectModeParams): Promise<void> => {
      const { projectId, mode, projectSessions, paneId } = params

      // Get fresh pane data from query cache to avoid stale closure issues
      // This is critical after operations like Close All where the panes array
      // in the closure may be outdated
      const freshPanesData = queryClient.getQueryData<PaneListResponse>([
        'terminal-panes',
      ])
      const freshPanes = freshPanesData?.items ?? panes

      // 1. Find pane - prefer by paneId (exact match), fallback to projectId
      const pane = paneId
        ? freshPanes.find((p) => p.id === paneId)
        : freshPanes.find((p) => p.project_id === projectId)

      if (pane) {
        // New pane-based path: sessions already exist in the pane
        // 2. Update pane's active_mode and get the UPDATED pane back
        const updatedPane = await setActiveMode(pane.id, mode)

        // 3. Find the target session in the UPDATED pane (not the stale one)
        const targetSession = updatedPane.sessions.find((s) => s.mode === mode)
        if (!targetSession) {
          console.error('Pane missing session for mode:', mode, updatedPane)
          return
        }

        // 4. Start Claude if needed
        if (mode === 'claude') {
          // Check if Claude is already running
          const claudeState = projectSessions.find(
            (s) => s.id === targetSession.id,
          )?.claude_state
          const needsClaudeStart =
            claudeState !== 'running' && claudeState !== 'starting'

          if (needsClaudeStart) {
            await startClaudeInSession(targetSession.id)
          }
        }

        // 5. Navigate to the session
        navigateToSession(targetSession.id)
      } else {
        // Legacy path: fallback to old behavior for backwards compatibility
        // (This shouldn't happen with the new architecture, but kept for safety)
        await switchMode(projectId, mode)

        const matchingSession = projectSessions.find((s) => s.mode === mode)
        if (matchingSession) {
          if (mode === 'claude') {
            const claudeState = matchingSession.claude_state
            const needsClaudeStart =
              claudeState !== 'running' && claudeState !== 'starting'
            if (needsClaudeStart) {
              await startClaudeInSession(matchingSession.id)
            }
          }
          navigateToSession(matchingSession.id)
        }
      }

      // 6. Scroll tab into view after mode switch
      setTimeout(() => {
        projectTabRefs.current.get(projectId)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        })
      }, TAB_SCROLL_DELAY_MS)
    },
    [
      queryClient,
      panes,
      setActiveMode,
      switchMode,
      startClaudeInSession,
      navigateToSession,
      projectTabRefs,
    ],
  )

  return {
    switchProjectMode,
    isPolling,
  }
}

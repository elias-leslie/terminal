import { type MutableRefObject, useCallback, useState } from 'react'
import type { TerminalMode } from '@/components/ModeToggle'
import type { TerminalHandle } from '@/components/Terminal'
import type { TerminalSession } from '@/lib/hooks/use-terminal-sessions'
import {
  getSlotSessionId,
  isPaneSlot,
  type PaneSlot,
  type TerminalSlot,
} from '@/lib/utils/slot'

interface UseTerminalSlotHandlersParams {
  terminalRefs: MutableRefObject<Map<string, TerminalHandle | null>>
  switchToSession: (sessionId: string) => void
  resetProject: (projectId: string) => Promise<void>
  reset: (sessionId: string) => Promise<unknown>
  disableProject: (projectId: string) => Promise<void>
  remove: (sessionId: string) => Promise<void>
  // Pane-based operations (new architecture)
  removePane?: (paneId: string) => Promise<void>
  handleNewTerminalForProject: (
    projectId: string,
    mode: 'shell' | 'claude',
  ) => void
  setShowCleaner: (show: boolean) => void
  setCleanerRawPrompt: (prompt: string) => void
  // For mode switching
  sessions: TerminalSession[]
  handleProjectModeChange: (
    projectId: string,
    newMode: 'shell' | 'claude',
    projectSessions: TerminalSession[],
    rootPath: string | null,
    paneId?: string,
  ) => Promise<void>
}

export function useTerminalSlotHandlers({
  terminalRefs,
  switchToSession,
  resetProject: _resetProject,
  reset,
  disableProject,
  remove,
  removePane,
  handleNewTerminalForProject,
  setShowCleaner,
  setCleanerRawPrompt,
  sessions,
  handleProjectModeChange,
}: UseTerminalSlotHandlersParams) {
  // Track mode switch loading state
  const [isModeSwitching, setIsModeSwitching] = useState(false)
  // Handler for switching to a slot's terminal
  const handleSlotSwitch = useCallback(
    (slot: TerminalSlot) => {
      const sessionId = getSlotSessionId(slot)
      if (sessionId) {
        switchToSession(sessionId)
      } else {
        // Session ID not found - this shouldn't happen but log it for debugging
        console.warn('handleSlotSwitch: No session ID for slot', slot)
      }
    },
    [switchToSession],
  )

  // Handler for resetting a slot's terminal
  // Resets ONLY the visible session (shell OR claude, not both)
  const handleSlotReset = useCallback(
    async (slot: TerminalSlot) => {
      if (slot.type === 'project') {
        // Reset only the currently visible session (determined by activeMode)
        if (slot.activeSessionId) {
          await reset(slot.activeSessionId)
        }
      } else {
        await reset(slot.sessionId)
      }
    },
    [reset],
  )

  // Handler for closing a slot's terminal
  // Uses pane-based deletion when available (new architecture), falls back to session-based
  const handleSlotClose = useCallback(
    async (slot: TerminalSlot | PaneSlot) => {
      // New pane architecture: use removePane if available and slot has paneId
      if (removePane && isPaneSlot(slot)) {
        await removePane(slot.paneId)
        return
      }

      // Legacy: session-based deletion
      if (slot.type === 'project') {
        await disableProject(slot.projectId)
      } else {
        await remove(slot.sessionId)
      }
    },
    [removePane, disableProject, remove],
  )

  // Handler for opening prompt cleaner for a slot
  const handleSlotClean = useCallback(
    (slot: TerminalSlot | PaneSlot) => {
      const sessionId = getSlotSessionId(slot)
      if (!sessionId) {
        console.warn('handleSlotClean: No session ID for slot', slot)
        return
      }
      const terminalRef = terminalRefs.current.get(sessionId)
      if (!terminalRef) {
        console.warn('handleSlotClean: No terminal ref for session', sessionId)
        return
      }
      const input = terminalRef.getLastLine()
      // Open cleaner even if input is empty - let user see the state
      // (empty input will show "no prompt to clean" in the cleaner)
      setCleanerRawPrompt(input || '')
      setShowCleaner(true)
    },
    [terminalRefs, setCleanerRawPrompt, setShowCleaner],
  )

  // Handler for creating new shell in a slot's project
  const handleSlotNewShell = useCallback(
    (slot: TerminalSlot) => {
      if (slot.type === 'project') {
        handleNewTerminalForProject(slot.projectId, 'shell')
      }
    },
    [handleNewTerminalForProject],
  )

  // Handler for creating new Claude terminal in a slot's project
  const handleSlotNewClaude = useCallback(
    (slot: TerminalSlot) => {
      if (slot.type === 'project') {
        handleNewTerminalForProject(slot.projectId, 'claude')
      }
    },
    [handleNewTerminalForProject],
  )

  // Handler for switching mode (shell <-> claude) on a slot
  const handleSlotModeSwitch = useCallback(
    async (slot: TerminalSlot | PaneSlot, mode: TerminalMode) => {
      if (slot.type !== 'project') return

      setIsModeSwitching(true)
      try {
        // Get all sessions for this project
        const projectSessions = sessions.filter(
          (s) => s.project_id === slot.projectId,
        )
        // Pass paneId if available (for direct pane mode switching)
        const paneId = isPaneSlot(slot) ? slot.paneId : undefined
        await handleProjectModeChange(
          slot.projectId,
          mode,
          projectSessions,
          slot.rootPath,
          paneId,
        )
      } finally {
        setIsModeSwitching(false)
      }
    },
    [sessions, handleProjectModeChange],
  )

  return {
    handleSlotSwitch,
    handleSlotReset,
    handleSlotClose,
    handleSlotClean,
    handleSlotNewShell,
    handleSlotNewClaude,
    handleSlotModeSwitch,
    isModeSwitching,
  }
}

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { LayoutMode } from '@/components/LayoutModeButton'
import type { KeyboardSizePreset } from '@/components/SettingsDropdown'
import type { ConnectionStatus, TerminalHandle } from '@/components/Terminal'
import { useClaudePolling } from '@/lib/hooks/use-claude-polling'
import { useProjectModeSwitch } from '@/lib/hooks/use-project-mode-switch'
import type { ProjectTerminal } from '@/lib/hooks/use-project-terminals'
import { useProjectTerminals } from '@/lib/hooks/use-project-terminals'
import type { TerminalSession } from '@/lib/hooks/use-terminal-sessions'
import { useTerminalSessions } from '@/lib/hooks/use-terminal-sessions'
import {
  addAdHocPaneAction,
  addProjectPaneAction,
  closeAllPanesAction,
  handleProjectTabClickAction,
} from './terminal-handler-actions'
import type {
  UseTerminalHandlersProps,
  UseTerminalHandlersReturn,
} from './use-terminal-handlers.types'

export function useTerminalHandlers({
  projectId,
  projectPath: _projectPath,
  sessions,
  adHocSessions: _adHocSessions,
  projectTerminals,
  activeSessionId,
  terminalRefs,
  projectTabRefs,
  setTerminalStatuses,
  setLayoutMode,
  setKeyboardSize,
  panes,
  panesAtLimit,
  createProjectPane,
  createAdHocPane,
  setActiveMode,
  removePane,
}: UseTerminalHandlersProps): UseTerminalHandlersReturn {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    create,
    update,
    remove,
    reset,
    resetAll,
    isLoading: sessionsLoading,
    isCreating,
  } = useTerminalSessions(projectId)
  const {
    switchMode,
    resetProject,
    disableProject,
    isLoading: projectsLoading,
  } = useProjectTerminals()
  const { startClaude } = useClaudePolling()
  const { switchProjectMode } = useProjectModeSwitch({
    switchMode,
    projectTabRefs,
    panes,
    setActiveMode,
  })

  const navigateToSession = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('session', sessionId)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  const handleKeyboardSizeChange = useCallback(
    (size: KeyboardSizePreset) => setKeyboardSize(size),
    [setKeyboardSize],
  )
  const handleStatusChange = useCallback(
    (sessionId: string, status: ConnectionStatus) =>
      setTerminalStatuses((prev) => new Map(prev).set(sessionId, status)),
    [setTerminalStatuses],
  )
  const handleKeyboardInput = useCallback(
    (data: string) =>
      activeSessionId && terminalRefs.current.get(activeSessionId)?.sendInput(data),
    [activeSessionId, terminalRefs],
  )
  const handleReconnect = useCallback(
    () => activeSessionId && terminalRefs.current.get(activeSessionId)?.reconnect(),
    [activeSessionId, terminalRefs],
  )
  const handleLayoutModeChange = useCallback(
    async (mode: LayoutMode) => setLayoutMode(mode),
    [setLayoutMode],
  )
  const handleAddTab = useCallback(
    () => addAdHocPaneAction(panes, panesAtLimit, createAdHocPane, navigateToSession),
    [panes, panesAtLimit, createAdHocPane, navigateToSession],
  )

  const handleNewTerminalForProject = useCallback(
    (targetProjectId: string, mode: 'shell' | 'claude', rootPath?: string | null) =>
      addProjectPaneAction(
        targetProjectId,
        mode,
        rootPath,
        projectTerminals,
        panes,
        panesAtLimit,
        createProjectPane,
        navigateToSession,
        startClaude,
      ),
    [
      projectTerminals,
      panes,
      panesAtLimit,
      createProjectPane,
      navigateToSession,
      startClaude,
    ],
  )

  const handleProjectTabClick = useCallback(
    (pt: ProjectTerminal) =>
      handleProjectTabClickAction(
        pt,
        panes,
        sessions,
        panesAtLimit,
        createProjectPane,
        navigateToSession,
        startClaude,
      ),
    [panes, sessions, panesAtLimit, createProjectPane, navigateToSession, startClaude],
  )

  const handleProjectModeChange = useCallback(
    async (
      projectIdArg: string,
      newMode: 'shell' | 'claude',
      projectSessions: TerminalSession[],
      rootPath: string | null,
      paneId?: string,
    ) => switchProjectMode({ projectId: projectIdArg, mode: newMode, projectSessions, rootPath, paneId }),
    [switchProjectMode],
  )
  const handleCloseAll = useCallback(
    () => closeAllPanesAction(panes, removePane, createAdHocPane, navigateToSession),
    [panes, removePane, createAdHocPane, navigateToSession],
  )
  const setTerminalRef = useCallback(
    (sessionId: string, handle: TerminalHandle | null) =>
      handle ? terminalRefs.current.set(sessionId, handle) : terminalRefs.current.delete(sessionId),
    [terminalRefs],
  )

  return {
    handleKeyboardSizeChange,
    handleStatusChange,
    handleKeyboardInput,
    handleReconnect,
    handleLayoutModeChange,
    handleAddTab,
    handleNewTerminalForProject,
    handleProjectTabClick,
    handleProjectModeChange,
    handleCloseAll,
    setTerminalRef,
    navigateToSession,
    create,
    update,
    remove,
    reset,
    resetAll,
    resetProject,
    disableProject,
    switchMode,
    isCreating,
    sessionsLoading,
    projectsLoading,
  }
}

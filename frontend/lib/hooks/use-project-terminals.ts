'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useProjectSettings } from './use-project-settings'
import {
  type TerminalSession,
  useTerminalSessions,
} from './use-terminal-sessions'
import { useResetProjectMutation } from './use-project-terminals-mutations'

export interface ProjectSession {
  session: TerminalSession
  badge: number
}

export interface ProjectTerminal {
  projectId: string
  projectName: string
  rootPath: string | null
  activeMode: 'shell' | 'claude'
  sessions: ProjectSession[]
  activeSession: TerminalSession | null
  activeSessionId: string | null
  sessionBadge: number | null
}

export interface UseProjectTerminalsResult {
  projectTerminals: ProjectTerminal[]
  adHocSessions: TerminalSession[]
  isLoading: boolean
  isError: boolean
  switchMode: (projectId: string, mode: 'shell' | 'claude') => Promise<void>
  resetProject: (projectId: string) => Promise<void>
  disableProject: (projectId: string) => Promise<void>
}

function buildProjectTerminal(
  project: { id: string; name: string; root_path: string | null; mode: 'shell' | 'claude' },
  sessions: TerminalSession[],
): ProjectTerminal {
  const projectSessions = sessions
    .filter((s) => s.project_id === project.id)
    .sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
      return aTime - bTime
    })

  const sessionsWithBadges: ProjectSession[] = projectSessions.map(
    (session, index) => ({ session, badge: index + 1 }),
  )

  const activeSession = projectSessions.find((s) => s.mode === project.mode) ?? null
  const sessionBadge = sessionsWithBadges.find((ps) => ps.session.id === activeSession?.id)?.badge ?? null

  return {
    projectId: project.id,
    projectName: project.name,
    rootPath: project.root_path,
    activeMode: project.mode,
    sessions: sessionsWithBadges,
    activeSession,
    activeSessionId: activeSession?.id ?? null,
    sessionBadge,
  }
}

export function useProjectTerminals(): UseProjectTerminalsResult {
  const router = useRouter()
  const searchParams = useSearchParams()

  const {
    enabledProjects,
    switchMode: switchProjectMode,
    updateSettings,
    isLoading: projectsLoading,
    isError: projectsError,
  } = useProjectSettings()

  const {
    sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useTerminalSessions()

  const switchToSessionViaUrl = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('session', sessionId)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  const projectTerminals = useMemo(
    () => enabledProjects.map((project) => buildProjectTerminal(project, sessions)),
    [enabledProjects, sessions],
  )

  const adHocSessions = useMemo(
    () => sessions.filter((s) => !s.project_id),
    [sessions],
  )

  const switchMode = useCallback(
    async (projectId: string, mode: 'shell' | 'claude') => {
      await switchProjectMode(projectId, mode)
    },
    [switchProjectMode],
  )

  const resetProjectMutation = useResetProjectMutation(
    projectTerminals,
    switchToSessionViaUrl,
  )

  const resetProject = useCallback(
    async (projectId: string) => {
      await resetProjectMutation.mutateAsync(projectId)
    },
    [resetProjectMutation],
  )

  const disableProject = useCallback(
    async (projectId: string) => {
      await updateSettings(projectId, { enabled: false })
    },
    [updateSettings],
  )

  return {
    projectTerminals,
    adHocSessions,
    isLoading: projectsLoading || sessionsLoading,
    isError: projectsError || sessionsError,
    switchMode,
    resetProject,
    disableProject,
  }
}

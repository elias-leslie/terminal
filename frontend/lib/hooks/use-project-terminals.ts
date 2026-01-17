'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import { useProjectSettings } from './use-project-settings'
import {
  type TerminalSession,
  useTerminalSessions,
} from './use-terminal-sessions'

// ============================================================================
// Types
// ============================================================================

export interface ProjectSession {
  session: TerminalSession
  badge: number // 1-indexed badge number for this project
}

export interface ProjectTerminal {
  projectId: string
  projectName: string
  rootPath: string | null
  activeMode: 'shell' | 'claude'
  // All sessions for this project (sorted by created_at)
  sessions: ProjectSession[]
  // Active session (based on mode - first matching session)
  activeSession: TerminalSession | null
  activeSessionId: string | null
  // Session badge for the active session
  sessionBadge: number | null
}

export interface UseProjectTerminalsResult {
  /** Enabled projects with dual session info merged */
  projectTerminals: ProjectTerminal[]
  /** Sessions without a project_id (generic shells) */
  adHocSessions: TerminalSession[]
  /** All data is loading */
  isLoading: boolean
  /** Error occurred */
  isError: boolean
  /** Switch project mode (shell <-> claude) */
  switchMode: (projectId: string, mode: 'shell' | 'claude') => Promise<void>
  /** Reset project sessions (delete and recreate) */
  resetProject: (projectId: string) => Promise<void>
  /** Disable project terminal */
  disableProject: (projectId: string) => Promise<void>
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that merges project settings with terminal sessions.
 *
 * Provides:
 * - projectTerminals: Enabled projects with session info (sessionId, etc.)
 * - adHocSessions: Sessions that aren't linked to projects
 *
 * @example
 * ```tsx
 * const { projectTerminals, adHocSessions } = useProjectTerminals();
 *
 * return (
 *   <>
 *     {projectTerminals.map(pt => (
 *       <Tab key={pt.projectId}>
 *         {pt.projectName}
 *       </Tab>
 *     ))}
 *     <Divider />
 *     {adHocSessions.map(s => (
 *       <Tab key={s.id}>{s.name}</Tab>
 *     ))}
 *   </>
 * );
 * ```
 */
export function useProjectTerminals(): UseProjectTerminalsResult {
  const queryClient = useQueryClient()
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

  // Helper to switch to a session via URL (bypasses stale closure validation)
  const switchToSessionViaUrl = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('session', sessionId)
      router.push(`?${params.toString()}`, { scroll: false })
    },
    [searchParams, router],
  )

  // Merge enabled projects with sessions, computing badges
  const projectTerminals = useMemo(() => {
    return enabledProjects.map((project) => {
      // Find all sessions for this project, sorted by created_at for badge assignment
      const projectSessions = sessions
        .filter((s) => s.project_id === project.id)
        .sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
          return aTime - bTime
        })

      // Assign 1-indexed badges
      const sessionsWithBadges: ProjectSession[] = projectSessions.map(
        (session, index) => ({
          session,
          badge: index + 1,
        }),
      )

      // Find active session based on mode (first matching session with that mode)
      const activeSession =
        projectSessions.find((s) => s.mode === project.mode) ?? null
      const activeBadgeEntry = sessionsWithBadges.find(
        (ps) => ps.session.id === activeSession?.id,
      )

      return {
        projectId: project.id,
        projectName: project.name,
        rootPath: project.root_path,
        activeMode: project.mode,
        sessions: sessionsWithBadges,
        activeSession,
        activeSessionId: activeSession?.id ?? null,
        sessionBadge: activeBadgeEntry?.badge ?? null,
      }
    })
  }, [enabledProjects, sessions])

  // Ad-hoc sessions: sessions without project_id
  const adHocSessions = useMemo(() => {
    return sessions.filter((s) => !s.project_id)
  }, [sessions])

  // Switch project mode
  const switchMode = useCallback(
    async (projectId: string, mode: 'shell' | 'claude') => {
      await switchProjectMode(projectId, mode)
    },
    [switchProjectMode],
  )

  // Reset project mutation with proper optimistic updates
  const resetProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch(`/api/terminal/projects/${projectId}/reset`, {
        method: 'POST',
      })
      if (!res.ok) {
        const error = await res
          .json()
          .catch(() => ({ detail: 'Failed to reset project' }))
        throw new Error(error.detail || 'Failed to reset project')
      }
      return res.json()
    },
    onMutate: async (projectId) => {
      // Cancel in-flight queries to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ['terminal-sessions'] })
      await queryClient.cancelQueries({ queryKey: ['terminal-projects'] })

      // Snapshot current state for rollback
      const previousSessions = queryClient.getQueryData<TerminalSession[]>([
        'terminal-sessions',
      ])

      // Get the project info for the old session IDs
      const project = projectTerminals.find((p) => p.projectId === projectId)
      const oldSessionIds = project?.sessions.map((ps) => ps.session.id) ?? []

      return { previousSessions, projectId, oldSessionIds }
    },
    onSuccess: (data, projectId, context) => {
      // data = { project_id, shell_session_id, claude_session_id, mode }
      const newShellSessionId = data.shell_session_id
      const newClaudeSessionId = data.claude_session_id

      // Find the project to get its info for constructing new sessions
      const project = projectTerminals.find((p) => p.projectId === projectId)

      // Optimistically update the session cache BEFORE setting activeId
      queryClient.setQueryData<TerminalSession[]>(
        ['terminal-sessions'],
        (old) => {
          if (!old) return old

          // Remove old sessions for this project
          const filtered = old.filter(
            (s) => !context?.oldSessionIds?.includes(s.id),
          )

          // Add new sessions with constructed data
          const newSessions: TerminalSession[] = []

          if (newShellSessionId) {
            newSessions.push({
              id: newShellSessionId,
              name: project ? `Project: ${project.projectId} (Shell)` : 'Shell',
              user_id: null,
              project_id: projectId,
              working_dir: project?.rootPath ?? null,
              mode: 'shell',
              display_order: 0,
              is_alive: true,
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
            })
          }

          if (newClaudeSessionId) {
            newSessions.push({
              id: newClaudeSessionId,
              name: project
                ? `Project: ${project.projectId} (Claude)`
                : 'Claude',
              user_id: null,
              project_id: projectId,
              working_dir: project?.rootPath ?? null,
              mode: 'claude',
              display_order: 0,
              is_alive: true,
              created_at: new Date().toISOString(),
              last_accessed_at: new Date().toISOString(),
            })
          }

          return [...filtered, ...newSessions]
        },
      )

      // Switch to new session via URL - the session is already in the cache
      // Use URL-based switching to avoid stale closure in switchToSession
      if (newShellSessionId) {
        switchToSessionViaUrl(newShellSessionId)
      }
    },
    onError: (_err, _projectId, context) => {
      // Rollback cache to previous state
      if (context?.previousSessions) {
        queryClient.setQueryData(
          ['terminal-sessions'],
          context.previousSessions,
        )
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency with server
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
      queryClient.invalidateQueries({ queryKey: ['terminal-projects'] })
    },
  })

  // Reset project sessions via mutation
  const resetProject = useCallback(
    async (projectId: string) => {
      return resetProjectMutation.mutateAsync(projectId)
    },
    [resetProjectMutation],
  )

  // Disable project terminal via API
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

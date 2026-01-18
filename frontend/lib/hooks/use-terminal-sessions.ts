'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { buildApiUrl } from '../api-config'

// ============================================================================
// Types
// ============================================================================

export interface TerminalSession {
  id: string
  name: string
  user_id: string | null
  project_id: string | null
  working_dir: string | null
  mode: 'shell' | 'claude'
  display_order: number
  is_alive: boolean
  created_at: string | null
  last_accessed_at: string | null
  // Claude state machine: not_started, starting, running, stopped, error
  claude_state?: 'not_started' | 'starting' | 'running' | 'stopped' | 'error'
}

interface SessionListResponse {
  items: TerminalSession[]
  total: number
}

interface CreateSessionRequest {
  name: string
  project_id?: string
  working_dir?: string
  mode?: 'shell' | 'claude'
}

interface UpdateSessionRequest {
  name?: string
  display_order?: number
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchSessions(): Promise<TerminalSession[]> {
  const res = await fetch(buildApiUrl('/api/terminal/sessions'))
  if (!res.ok) throw new Error('Failed to fetch terminal sessions')
  const data: SessionListResponse = await res.json()
  return data.items
}

async function createSession(
  request: CreateSessionRequest,
): Promise<TerminalSession> {
  const res = await fetch(buildApiUrl('/api/terminal/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: 'Failed to create session' }))
    throw new Error(error.detail || 'Failed to create session')
  }
  return res.json()
}

async function updateSession(
  sessionId: string,
  request: UpdateSessionRequest,
): Promise<TerminalSession> {
  const res = await fetch(buildApiUrl(`/api/terminal/sessions/${sessionId}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: 'Failed to update session' }))
    throw new Error(error.detail || 'Failed to update session')
  }
  return res.json()
}

async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(buildApiUrl(`/api/terminal/sessions/${sessionId}`), {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete session')
}

async function resetSession(sessionId: string): Promise<TerminalSession> {
  const res = await fetch(
    buildApiUrl(`/api/terminal/sessions/${sessionId}/reset`),
    {
      method: 'POST',
    },
  )
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: 'Failed to reset session' }))
    throw new Error(error.detail || 'Failed to reset session')
  }
  return res.json()
}

async function resetAllSessions(): Promise<{ count: number }> {
  const res = await fetch(buildApiUrl('/api/terminal/reset-all'), {
    method: 'POST',
  })
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: 'Failed to reset all sessions' }))
    throw new Error(error.detail || 'Failed to reset all sessions')
  }
  return res.json()
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing terminal sessions with backend sync.
 *
 * Provides:
 * - sessions: List of terminal sessions from backend
 * - activeId: Currently active session ID
 * - setActiveId: Set active session
 * - create: Create new session (server generates ID)
 * - update: Update session metadata
 * - remove: Delete session (also kills tmux)
 * - isLoading, isError, error: Query state
 *
 * @param projectId - Optional project ID for new sessions
 *
 * @example
 * ```tsx
 * const { sessions, activeId, create, remove } = useTerminalSessions();
 *
 * return (
 *   <div>
 *     {sessions.map(s => (
 *       <button key={s.id} onClick={() => setActiveId(s.id)}>
 *         {s.name}
 *       </button>
 *     ))}
 *     <button onClick={() => create("Terminal")}>New</button>
 *   </div>
 * );
 * ```
 */
export function useTerminalSessions(projectId?: string) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Query: fetch sessions
  const {
    data: sessions = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['terminal-sessions'],
    queryFn: fetchSessions,
    // No polling - use explicit invalidation via queryClient.invalidateQueries
  })

  // Set initial active session when sessions load
  // (if no active ID set and we have sessions)
  if (!activeId && sessions.length > 0) {
    setActiveId(sessions[0].id)
  }

  // Mutation: create session
  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
      // Switch to new session
      setActiveId(newSession.id)
    },
  })

  // Mutation: update session
  const updateMutation = useMutation({
    mutationFn: ({
      sessionId,
      ...request
    }: UpdateSessionRequest & { sessionId: string }) =>
      updateSession(sessionId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
    },
  })

  // Mutation: delete session
  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
      // If deleted active session, switch to another
      if (activeId === deletedId) {
        const remaining = sessions.filter((s) => s.id !== deletedId)
        setActiveId(remaining[0]?.id ?? null)
      }
    },
  })

  // Mutation: reset session
  const resetMutation = useMutation({
    mutationFn: resetSession,
    onMutate: async (oldSessionId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['terminal-sessions'] })
      // Snapshot for rollback
      const previousSessions = queryClient.getQueryData<TerminalSession[]>([
        'terminal-sessions',
      ])
      // Return context for rollback
      return { oldSessionId, previousSessions }
    },
    onSuccess: (newSession, oldSessionId) => {
      // Update the cache with the new session BEFORE setting activeId
      queryClient.setQueryData<TerminalSession[]>(
        ['terminal-sessions'],
        (old) => {
          if (!old) return [newSession]
          // Remove old session, add new one
          return [...old.filter((s) => s.id !== oldSessionId), newSession]
        },
      )
      // NOW switch to the new session - it's already in the cache
      setActiveId(newSession.id)
    },
    onError: (_err, _oldSessionId, context) => {
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
    },
  })

  // Mutation: reset all sessions
  const resetAllMutation = useMutation({
    mutationFn: resetAllSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })
    },
  })

  // Create new session
  // Pass isGeneric=true to create an ad-hoc terminal without project association
  const create = useCallback(
    async (
      name: string,
      workingDir?: string,
      mode?: 'shell' | 'claude',
      isGeneric?: boolean,
    ) => {
      return createMutation.mutateAsync({
        name,
        project_id: isGeneric ? undefined : projectId,
        working_dir: workingDir,
        mode,
      })
    },
    [createMutation, projectId],
  )

  // Update session
  const update = useCallback(
    async (sessionId: string, updates: UpdateSessionRequest) => {
      return updateMutation.mutateAsync({ sessionId, ...updates })
    },
    [updateMutation],
  )

  // Remove session
  const remove = useCallback(
    async (sessionId: string) => {
      return deleteMutation.mutateAsync(sessionId)
    },
    [deleteMutation],
  )

  // Reset a single session (delete and recreate)
  const reset = useCallback(
    async (sessionId: string) => {
      return resetMutation.mutateAsync(sessionId)
    },
    [resetMutation],
  )

  // Reset all sessions
  const resetAll = useCallback(async () => {
    return resetAllMutation.mutateAsync()
  }, [resetAllMutation])

  return {
    sessions,
    activeId,
    setActiveId,
    create,
    update,
    remove,
    reset,
    resetAll,
    isLoading,
    isError,
    error,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isResetting: resetMutation.isPending || resetAllMutation.isPending,
  }
}

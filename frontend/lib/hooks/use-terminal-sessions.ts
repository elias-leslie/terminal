'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { buildApiUrl } from '../api-config'

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

async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  defaultError = 'Request failed',
): Promise<T> {
  const res = await fetch(buildApiUrl(url), options)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: defaultError }))
    throw new Error(error.detail || defaultError)
  }
  return res.json()
}

const jsonHeaders = { 'Content-Type': 'application/json' }

const fetchSessions = async (): Promise<TerminalSession[]> =>
  (await apiFetch<SessionListResponse>('/api/terminal/sessions')).items

const createSession = (req: CreateSessionRequest) =>
  apiFetch<TerminalSession>('/api/terminal/sessions', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })

const updateSession = (sessionId: string, req: UpdateSessionRequest) =>
  apiFetch<TerminalSession>(`/api/terminal/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: jsonHeaders,
    body: JSON.stringify(req),
  })

const deleteSession = async (sessionId: string): Promise<void> => {
  const res = await fetch(buildApiUrl(`/api/terminal/sessions/${sessionId}`), {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete session')
}

const resetSession = (sessionId: string) =>
  apiFetch<TerminalSession>(`/api/terminal/sessions/${sessionId}/reset`, { method: 'POST' })

const resetAllSessions = () =>
  apiFetch<{ count: number }>('/api/terminal/reset-all', { method: 'POST' })

/** Hook for managing terminal sessions with backend sync */
export function useTerminalSessions(projectId?: string) {
  const queryClient = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['terminal-sessions'] })

  const {
    data: sessions = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['terminal-sessions'],
    queryFn: fetchSessions,
  })

  if (!activeId && sessions.length > 0) setActiveId(sessions[0].id)

  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: (newSession) => {
      invalidate()
      setActiveId(newSession.id)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ sessionId, ...request }: UpdateSessionRequest & { sessionId: string }) =>
      updateSession(sessionId, request),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: (_, deletedId) => {
      invalidate()
      if (activeId === deletedId) {
        const remaining = sessions.filter((s) => s.id !== deletedId)
        setActiveId(remaining[0]?.id ?? null)
      }
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetSession,
    onMutate: async (oldSessionId) => {
      await queryClient.cancelQueries({ queryKey: ['terminal-sessions'] })
      return {
        oldSessionId,
        previousSessions: queryClient.getQueryData<TerminalSession[]>(['terminal-sessions']),
      }
    },
    onSuccess: (newSession, oldSessionId) => {
      queryClient.setQueryData<TerminalSession[]>(
        ['terminal-sessions'],
        (old) => (old ? [...old.filter((s) => s.id !== oldSessionId), newSession] : [newSession]),
      )
      setActiveId(newSession.id)
    },
    onError: (_err, _oldSessionId, ctx) =>
      ctx?.previousSessions &&
      queryClient.setQueryData(['terminal-sessions'], ctx.previousSessions),
    onSettled: invalidate,
  })

  const resetAllMutation = useMutation({
    mutationFn: resetAllSessions,
    onSuccess: invalidate,
  })

  const create = useCallback(
    (name: string, workingDir?: string, mode?: 'shell' | 'claude', isGeneric?: boolean) =>
      createMutation.mutateAsync({
        name,
        project_id: isGeneric ? undefined : projectId,
        working_dir: workingDir,
        mode,
      }),
    [createMutation, projectId],
  )

  const update = useCallback(
    (sessionId: string, updates: UpdateSessionRequest) =>
      updateMutation.mutateAsync({ sessionId, ...updates }),
    [updateMutation],
  )

  const remove = useCallback(
    (sessionId: string) => deleteMutation.mutateAsync(sessionId),
    [deleteMutation],
  )

  const reset = useCallback(
    (sessionId: string) => resetMutation.mutateAsync(sessionId),
    [resetMutation],
  )

  const resetAll = useCallback(() => resetAllMutation.mutateAsync(), [resetAllMutation])

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

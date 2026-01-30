'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import * as api from './terminal-panes-api'
import type {
  TerminalPane,
  PaneListResponse,
  UpdatePaneRequest,
} from './terminal-panes-types'

const invalidatePanesAndSessions = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['terminal-panes'] })
  qc.invalidateQueries({ queryKey: ['terminal-sessions'] })
}

export function useTerminalPanes() {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['terminal-panes'],
    queryFn: api.fetchPanes,
  })

  const panes = data?.items ?? []
  const maxPanes = data?.max_panes ?? 4
  const atLimit = panes.length >= maxPanes

  const createMutation = useMutation({
    mutationFn: api.createPane,
    onSuccess: () => invalidatePanesAndSessions(queryClient),
  })

  const updateMutation = useMutation({
    mutationFn: ({ paneId, ...req }: UpdatePaneRequest & { paneId: string }) =>
      api.updatePane(paneId, req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['terminal-panes'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deletePane,
    onSuccess: () => invalidatePanesAndSessions(queryClient),
  })

  const swapMutation = useMutation({
    mutationFn: api.swapPanes,
    onMutate: async ({ pane_id_a, pane_id_b }) => {
      await queryClient.cancelQueries({ queryKey: ['terminal-panes'] })
      const previous = queryClient.getQueryData<PaneListResponse>(['terminal-panes'])

      if (previous) {
        const paneA = previous.items.find((p) => p.id === pane_id_a)
        const paneB = previous.items.find((p) => p.id === pane_id_b)
        if (paneA && paneB) {
          const items = previous.items.map((p) =>
            p.id === pane_id_a ? { ...p, pane_order: paneB.pane_order } :
            p.id === pane_id_b ? { ...p, pane_order: paneA.pane_order } : p
          )
          items.sort((a, b) => a.pane_order - b.pane_order)
          queryClient.setQueryData(['terminal-panes'], { ...previous, items })
        }
      }
      return { previous }
    },
    onError: (_e, _v, ctx) => ctx?.previous && queryClient.setQueryData(['terminal-panes'], ctx.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['terminal-panes'] }),
  })

  const layoutMutation = useMutation({ mutationFn: api.updateAllLayouts })

  const createProjectPane = useCallback(
    (name: string, projectId: string, workingDir?: string) =>
      createMutation.mutateAsync({ pane_type: 'project', pane_name: name, project_id: projectId, working_dir: workingDir }),
    [createMutation]
  )

  const createAdHocPane = useCallback(
    (name: string, workingDir?: string) =>
      createMutation.mutateAsync({ pane_type: 'adhoc', pane_name: name, working_dir: workingDir }),
    [createMutation]
  )

  const setActiveMode = useCallback(
    (paneId: string, mode: 'shell' | 'claude') =>
      updateMutation.mutateAsync({ paneId, active_mode: mode }),
    [updateMutation]
  )

  const renamePne = useCallback(
    (paneId: string, newName: string) =>
      updateMutation.mutateAsync({ paneId, pane_name: newName }),
    [updateMutation]
  )

  const removePane = useCallback(
    (paneId: string) => deleteMutation.mutateAsync(paneId),
    [deleteMutation]
  )

  const swapPanePositions = useCallback(
    (paneIdA: string, paneIdB: string) =>
      swapMutation.mutateAsync({ pane_id_a: paneIdA, pane_id_b: paneIdB }),
    [swapMutation]
  )

  const saveLayouts = useCallback(
    (layouts: Array<{ paneId: string; widthPercent?: number; heightPercent?: number }>) =>
      layoutMutation.mutateAsync({
        layouts: layouts.map((l) => ({
          pane_id: l.paneId,
          width_percent: l.widthPercent,
          height_percent: l.heightPercent,
        })),
      }),
    [layoutMutation]
  )

  const getActiveSessionId = useCallback(
    (pane: TerminalPane) => pane.sessions.find((s) => s.mode === pane.active_mode)?.id ?? null,
    []
  )

  const getSessionByMode = useCallback(
    (pane: TerminalPane, mode: 'shell' | 'claude') =>
      pane.sessions.find((s) => s.mode === mode) ?? null,
    []
  )

  return {
    panes,
    maxPanes,
    atLimit,
    isLoading,
    isError,
    error,
    createProjectPane,
    createAdHocPane,
    isCreating: createMutation.isPending,
    setActiveMode,
    renamePne,
    isUpdating: updateMutation.isPending,
    removePane,
    isDeleting: deleteMutation.isPending,
    swapPanePositions,
    isSwapping: swapMutation.isPending,
    saveLayouts,
    isSavingLayouts: layoutMutation.isPending,
    getActiveSessionId,
    getSessionByMode,
  }
}

export type {
  TerminalPane,
  PaneSession,
  CreatePaneRequest,
  UpdatePaneRequest,
  SwapPanesRequest,
} from './terminal-panes-types'

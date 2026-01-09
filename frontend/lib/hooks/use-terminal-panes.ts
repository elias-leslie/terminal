"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

// ============================================================================
// Types
// ============================================================================

export interface PaneSession {
  id: string;
  name: string;
  mode: "shell" | "claude";
  session_number: number;
  is_alive: boolean;
  working_dir: string | null;
}

export interface TerminalPane {
  id: string;
  pane_type: "project" | "adhoc";
  project_id: string | null;
  pane_order: number;
  pane_name: string;
  active_mode: "shell" | "claude";
  created_at: string | null;
  sessions: PaneSession[];
}

interface PaneListResponse {
  items: TerminalPane[];
  total: number;
  max_panes: number;
}

interface PaneCountResponse {
  count: number;
  max_panes: number;
  at_limit: boolean;
}

interface CreatePaneRequest {
  pane_type: "project" | "adhoc";
  pane_name: string;
  project_id?: string;
  working_dir?: string;
}

interface UpdatePaneRequest {
  pane_name?: string;
  active_mode?: "shell" | "claude";
}

interface SwapPanesRequest {
  pane_id_a: string;
  pane_id_b: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchPanes(): Promise<PaneListResponse> {
  const res = await fetch("/api/terminal/panes");
  if (!res.ok) throw new Error("Failed to fetch terminal panes");
  return res.json();
}

async function fetchPaneCount(): Promise<PaneCountResponse> {
  const res = await fetch("/api/terminal/panes/count");
  if (!res.ok) throw new Error("Failed to fetch pane count");
  return res.json();
}

async function createPane(request: CreatePaneRequest): Promise<TerminalPane> {
  const res = await fetch("/api/terminal/panes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: "Failed to create pane" }));
    throw new Error(error.detail || "Failed to create pane");
  }
  return res.json();
}

async function updatePane(
  paneId: string,
  request: UpdatePaneRequest,
): Promise<TerminalPane> {
  const res = await fetch(`/api/terminal/panes/${paneId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const error = await res
      .json()
      .catch(() => ({ detail: "Failed to update pane" }));
    throw new Error(error.detail || "Failed to update pane");
  }
  return res.json();
}

async function deletePane(paneId: string): Promise<void> {
  const res = await fetch(`/api/terminal/panes/${paneId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete pane");
}

async function swapPanes(request: SwapPanesRequest): Promise<void> {
  const res = await fetch("/api/terminal/panes/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error("Failed to swap panes");
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing terminal panes with backend sync.
 *
 * Panes are the new top-level container for terminal sessions:
 * - Project panes: contain shell + claude sessions (toggled via active_mode)
 * - Ad-hoc panes: contain shell session only
 *
 * Max 4 panes allowed.
 *
 * @example
 * ```tsx
 * const { panes, createProjectPane, deletePane, swapPanePositions } = useTerminalPanes();
 *
 * return (
 *   <div>
 *     {panes.map(p => (
 *       <div key={p.id}>{p.pane_name}</div>
 *     ))}
 *     <button
 *       onClick={() => createProjectPane('SummitFlow', 'summitflow', '/home/user/summitflow')}
 *       disabled={atLimit}
 *     >
 *       Add Pane
 *     </button>
 *   </div>
 * );
 * ```
 */
export function useTerminalPanes() {
  const queryClient = useQueryClient();

  // Query: fetch panes with sessions
  const {
    data: panesData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["terminal-panes"],
    queryFn: fetchPanes,
  });

  const panes = panesData?.items ?? [];
  const maxPanes = panesData?.max_panes ?? 4;
  const atLimit = panes.length >= maxPanes;

  // Mutation: create pane
  const createMutation = useMutation({
    mutationFn: createPane,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-panes"] });
      // Also invalidate sessions since new ones were created
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
    },
  });

  // Mutation: update pane
  const updateMutation = useMutation({
    mutationFn: ({
      paneId,
      ...request
    }: UpdatePaneRequest & { paneId: string }) => updatePane(paneId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-panes"] });
    },
  });

  // Mutation: delete pane
  const deleteMutation = useMutation({
    mutationFn: deletePane,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["terminal-panes"] });
      // Also invalidate sessions since they were cascade-deleted
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
    },
  });

  // Mutation: swap panes
  const swapMutation = useMutation({
    mutationFn: swapPanes,
    onMutate: async ({ pane_id_a, pane_id_b }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["terminal-panes"] });

      // Snapshot for rollback
      const previousPanes = queryClient.getQueryData<PaneListResponse>([
        "terminal-panes",
      ]);

      // Optimistically update the cache
      if (previousPanes) {
        const paneA = previousPanes.items.find((p) => p.id === pane_id_a);
        const paneB = previousPanes.items.find((p) => p.id === pane_id_b);

        if (paneA && paneB) {
          const newItems = previousPanes.items.map((p) => {
            if (p.id === pane_id_a) {
              return { ...p, pane_order: paneB.pane_order };
            }
            if (p.id === pane_id_b) {
              return { ...p, pane_order: paneA.pane_order };
            }
            return p;
          });

          // Sort by new order
          newItems.sort((a, b) => a.pane_order - b.pane_order);

          queryClient.setQueryData<PaneListResponse>(["terminal-panes"], {
            ...previousPanes,
            items: newItems,
          });
        }
      }

      return { previousPanes };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousPanes) {
        queryClient.setQueryData(["terminal-panes"], context.previousPanes);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ["terminal-panes"] });
    },
  });

  // Create project pane
  const createProjectPane = useCallback(
    async (paneName: string, projectId: string, workingDir?: string) => {
      return createMutation.mutateAsync({
        pane_type: "project",
        pane_name: paneName,
        project_id: projectId,
        working_dir: workingDir,
      });
    },
    [createMutation],
  );

  // Create ad-hoc pane
  const createAdHocPane = useCallback(
    async (paneName: string, workingDir?: string) => {
      return createMutation.mutateAsync({
        pane_type: "adhoc",
        pane_name: paneName,
        working_dir: workingDir,
      });
    },
    [createMutation],
  );

  // Update pane mode
  const setActiveMode = useCallback(
    async (paneId: string, mode: "shell" | "claude") => {
      return updateMutation.mutateAsync({ paneId, active_mode: mode });
    },
    [updateMutation],
  );

  // Update pane name
  const renamePne = useCallback(
    async (paneId: string, newName: string) => {
      return updateMutation.mutateAsync({ paneId, pane_name: newName });
    },
    [updateMutation],
  );

  // Delete pane
  const removePane = useCallback(
    async (paneId: string) => {
      return deleteMutation.mutateAsync(paneId);
    },
    [deleteMutation],
  );

  // Swap pane positions
  const swapPanePositions = useCallback(
    async (paneIdA: string, paneIdB: string) => {
      return swapMutation.mutateAsync({
        pane_id_a: paneIdA,
        pane_id_b: paneIdB,
      });
    },
    [swapMutation],
  );

  // Get session ID for the active mode of a pane
  const getActiveSessionId = useCallback(
    (pane: TerminalPane): string | null => {
      const session = pane.sessions.find((s) => s.mode === pane.active_mode);
      return session?.id ?? null;
    },
    [],
  );

  // Get a specific session from a pane by mode
  const getSessionByMode = useCallback(
    (pane: TerminalPane, mode: "shell" | "claude"): PaneSession | null => {
      return pane.sessions.find((s) => s.mode === mode) ?? null;
    },
    [],
  );

  return {
    panes,
    maxPanes,
    atLimit,
    isLoading,
    isError,
    error,
    // Create operations
    createProjectPane,
    createAdHocPane,
    isCreating: createMutation.isPending,
    // Update operations
    setActiveMode,
    renamePne,
    isUpdating: updateMutation.isPending,
    // Delete operations
    removePane,
    isDeleting: deleteMutation.isPending,
    // Swap operations
    swapPanePositions,
    isSwapping: swapMutation.isPending,
    // Helpers
    getActiveSessionId,
    getSessionByMode,
  };
}

// Re-export types for consumers
export type { CreatePaneRequest, UpdatePaneRequest, SwapPanesRequest };

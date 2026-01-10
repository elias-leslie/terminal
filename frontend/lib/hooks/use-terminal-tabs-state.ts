"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { TerminalHandle, ConnectionStatus } from "@/components/Terminal";
import { LayoutMode } from "@/components/LayoutModeButton";
import { useActiveSession } from "@/lib/hooks/use-active-session";
import { useTerminalSettings } from "@/lib/hooks/use-terminal-settings";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useTabEditing } from "@/lib/hooks/use-tab-editing";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { useTerminalHandlers } from "@/lib/hooks/use-terminal-handlers";
import { KeyboardSizePreset } from "@/components/SettingsDropdown";
import {
  type TerminalSlot,
  type PaneSlot,
  panesToSlots,
  getSlotPanelId,
} from "@/lib/utils/slot";
import { useAvailableLayouts } from "@/lib/hooks/use-available-layouts";
import { useTerminalPanes } from "@/lib/hooks/use-terminal-panes";

interface UseTerminalTabsStateProps {
  projectId?: string;
  projectPath?: string;
}

export function useTerminalTabsState({
  projectId,
  projectPath,
}: UseTerminalTabsStateProps) {
  // URL-based active session (single source of truth)
  const {
    activeSessionId,
    switchToSession,
    sessions,
    projectTerminals,
    adHocSessions,
    isLoading: activeSessionLoading,
  } = useActiveSession();

  // Pane-based data (new architecture: panes are the top-level container)
  const {
    panes,
    atLimit: panesAtLimit,
    isLoading: panesLoading,
    swapPanePositions,
    removePane,
    setActiveMode,
    createAdHocPane,
    createProjectPane,
    isCreating: isPaneCreating,
  } = useTerminalPanes();

  // Layout state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");

  // Get the active session's project_id for per-project settings
  const activeSessionProjectId = useMemo(() => {
    if (!activeSessionId) return undefined;
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    return activeSession?.project_id ?? undefined;
  }, [activeSessionId, sessions]);

  const {
    fontId,
    fontSize,
    fontFamily,
    scrollback,
    cursorStyle,
    cursorBlink,
    themeId,
    theme,
    setFontId,
    setFontSize,
    setScrollback,
    setCursorStyle,
    setCursorBlink,
    setThemeId,
  } = useTerminalSettings(activeSessionProjectId);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardSize, setKeyboardSize] =
    useLocalStorageState<KeyboardSizePreset>(
      "terminal-keyboard-size",
      "medium",
    );
  const [showTerminalManager, setShowTerminalManager] = useState(false);

  // Terminal refs and connection status tracking
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [terminalStatuses, setTerminalStatuses] = useState<
    Map<string, ConnectionStatus>
  >(new Map());
  const projectTabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Handlers hook (includes session/project mutations and all event handlers)
  const {
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
    // Passthrough from sub-hooks
    create,
    update,
    remove,
    reset,
    resetAll,
    resetProject,
    disableProject,
    isCreating,
    sessionsLoading,
    projectsLoading,
  } = useTerminalHandlers({
    projectId,
    projectPath,
    sessions,
    adHocSessions,
    projectTerminals,
    activeSessionId,
    terminalRefs,
    projectTabRefs,
    setTerminalStatuses,
    setLayoutMode,
    setKeyboardSize,
    // Pane operations
    panes,
    panesAtLimit,
    createProjectPane,
    createAdHocPane,
    setActiveMode,
    removePane,
  });

  // Combined loading state
  const isLoading =
    activeSessionLoading || sessionsLoading || projectsLoading || panesLoading;

  // Available layouts based on viewport width
  const availableLayouts = useAvailableLayouts();

  // Unified slots array derived from panes (new architecture)
  // Panes are already ordered by pane_order from the API
  const terminalSlots: PaneSlot[] = useMemo(() => {
    return panesToSlots(panes);
  }, [panes]);

  // Derive ordered IDs from panes (already ordered by pane_order)
  const orderedIds = useMemo(() => {
    return terminalSlots.map((slot) => getSlotPanelId(slot));
  }, [terminalSlots]);

  // Reorder callback (currently no-op, ordering is DB-driven)
  const reorder = useCallback((newOrder: string[]) => {
    // TODO: Implement bulk reorder via API if needed
    console.log("reorder requested:", newOrder);
  }, []);

  // Swap panes via DB-backed API
  const swapPanes = useCallback(
    async (slotIdA: string, slotIdB: string) => {
      // Find pane IDs from slot IDs
      const slotA = terminalSlots.find((s) => getSlotPanelId(s) === slotIdA);
      const slotB = terminalSlots.find((s) => getSlotPanelId(s) === slotIdB);

      if (!slotA || !slotB) {
        console.warn("swapPanes: slot not found", { slotIdA, slotIdB });
        return;
      }

      await swapPanePositions(slotA.paneId, slotB.paneId);
    },
    [terminalSlots, swapPanePositions],
  );

  // Check if at maximum pane limit
  const canAddPane = useCallback(() => {
    return !panesAtLimit;
  }, [panesAtLimit]);

  // Helper to check if current layout is a grid mode
  const isGridMode = layoutMode.startsWith("grid-");

  // Get active terminal status
  const activeStatus = activeSessionId
    ? terminalStatuses.get(activeSessionId)
    : undefined;
  const showReconnect =
    activeStatus && ["disconnected", "error", "timeout"].includes(activeStatus);

  // Auto-downgrade layout if current mode is no longer available
  useEffect(() => {
    if (!availableLayouts.includes(layoutMode)) {
      const highest = availableLayouts[availableLayouts.length - 1] || "single";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync layout to viewport constraints
      setLayoutMode(highest);
    }
  }, [availableLayouts, layoutMode, setLayoutMode]);

  // Helper to get correct pane name with badge
  const getAdHocPaneName = useCallback((existingPanes: typeof panes) => {
    const adHocCount = existingPanes.filter(
      (p) => p.pane_type === "adhoc",
    ).length;
    if (adHocCount === 0) return "Ad-Hoc Terminal";
    return `Ad-Hoc Terminal [${adHocCount + 1}]`;
  }, []);

  const getProjectPaneName = useCallback(
    (existingPanes: typeof panes, projId: string) => {
      const projectPanes = existingPanes.filter((p) => p.project_id === projId);
      const baseName = projId.charAt(0).toUpperCase() + projId.slice(1);
      if (projectPanes.length === 0) return baseName;
      return `${baseName} [${projectPanes.length + 1}]`;
    },
    [],
  );

  // Track whether initial load has completed - auto-create only runs during initial load
  // Once initial load is done, user has full control (no more auto-creation)
  const hasCompletedInitialLoad = useRef(false);
  const initialLoadProcessed = useRef(false);

  // Auto-create panes ONLY on initial mount (first load)
  // After this, user controls pane creation via "+" button or modal
  useEffect(() => {
    // Skip if still loading or already processed initial load
    if (isLoading || isPaneCreating || initialLoadProcessed.current) return;

    // Mark as processed to prevent re-runs
    initialLoadProcessed.current = true;

    // If no panes exist on initial load, create default ad-hoc pane
    if (panes.length === 0) {
      // Double-check server state before creating
      fetch("/api/terminal/panes/count")
        .then((res) => res.json())
        .then((data) => {
          if (data.count === 0) {
            return createAdHocPane(getAdHocPaneName(panes));
          }
        })
        .finally(() => {
          hasCompletedInitialLoad.current = true;
        });
    } else {
      // Panes already exist - check if we need to create project pane
      hasCompletedInitialLoad.current = true;

      // If ?project=X in URL but no pane for that project, create one
      if (projectId) {
        const hasProjectPane = panes.some((p) => p.project_id === projectId);
        if (!hasProjectPane) {
          fetch("/api/terminal/panes/count")
            .then((res) => res.json())
            .then((data) => {
              if (data.count < data.max_panes) {
                const paneName = getProjectPaneName(panes, projectId);
                return createProjectPane(paneName, projectId, projectPath);
              }
            });
        }
      }
    }
  }, [
    isLoading,
    panes,
    isPaneCreating,
    createAdHocPane,
    createProjectPane,
    getAdHocPaneName,
    getProjectPaneName,
    projectId,
    projectPath,
  ]);

  // Tab editing hook
  const tabEditingProps = useTabEditing({
    onSave: async (sessionId: string, newName: string) => {
      await update(sessionId, { name: newName });
    },
  });

  return {
    // Session state
    activeSessionId,
    switchToSession,
    sessions,
    projectTerminals,
    adHocSessions,
    isLoading,
    isCreating,

    // Layout state
    layoutMode,
    setLayoutMode,
    availableLayouts,
    isGridMode,

    // Terminal slots (pane-based)
    terminalSlots,
    orderedIds,
    reorder,
    swapPanes,
    canAddPane,
    // Pane operations
    panes,
    panesAtLimit,
    removePane,
    setActiveMode,
    createAdHocPane,
    createProjectPane,
    isPaneCreating,

    // Terminal refs and statuses
    terminalRefs,
    terminalStatuses,
    projectTabRefs,
    setTerminalRef,

    // Settings
    fontId,
    fontSize,
    fontFamily,
    scrollback,
    cursorStyle,
    cursorBlink,
    themeId,
    theme,
    setFontId,
    setFontSize,
    setScrollback,
    setCursorStyle,
    setCursorBlink,
    setThemeId,
    showSettings,
    setShowSettings,
    keyboardSize,
    handleKeyboardSizeChange,
    isMobile,

    // Terminal manager modal
    showTerminalManager,
    setShowTerminalManager,

    // Connection status
    activeStatus,
    showReconnect,

    // Tab editing
    ...tabEditingProps,

    // Handlers
    handleStatusChange,
    handleKeyboardInput,
    handleReconnect,
    handleLayoutModeChange,
    handleAddTab,
    handleNewTerminalForProject,
    handleProjectTabClick,
    handleProjectModeChange,
    handleCloseAll,

    // Project operations
    resetProject,
    disableProject,
    reset,
    resetAll,
    remove,
  };
}

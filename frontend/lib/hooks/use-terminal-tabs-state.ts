"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { TerminalHandle, ConnectionStatus } from "@/components/Terminal";
import { LayoutMode } from "@/components/LayoutModeButton";
import { useActiveSession } from "@/lib/hooks/use-active-session";
import { useTerminalSettings } from "@/lib/hooks/use-terminal-settings";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useTabEditing } from "@/lib/hooks/use-tab-editing";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { useTerminalHandlers } from "@/lib/hooks/use-terminal-handlers";
import { KeyboardSizePreset } from "@/components/SettingsDropdown";
import { type TerminalSlot } from "@/lib/utils/slot";
import { useAvailableLayouts } from "@/lib/hooks/use-available-layouts";
import { useSlotOrdering } from "@/lib/hooks/use-slot-ordering";

// Maximum number of split panes
const MAX_SPLIT_PANES = 4;

interface UseTerminalTabsStateProps {
  projectId?: string;
  projectPath?: string;
}

export function useTerminalTabsState({ projectId, projectPath }: UseTerminalTabsStateProps) {
  // URL-based active session (single source of truth)
  const {
    activeSessionId,
    switchToSession,
    sessions,
    projectTerminals,
    adHocSessions,
    isLoading: activeSessionLoading,
  } = useActiveSession();

  // Layout state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");
  const { fontId, fontSize, fontFamily, setFontId, setFontSize } = useTerminalSettings();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardSize, setKeyboardSize] = useLocalStorageState<KeyboardSizePreset>("terminal-keyboard-size", "medium");
  const [showTerminalManager, setShowTerminalManager] = useState(false);

  // Terminal refs and connection status tracking
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [terminalStatuses, setTerminalStatuses] = useState<Map<string, ConnectionStatus>>(new Map());
  const projectTabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasAutoCreated = useRef(false);

  // Handlers hook (includes session/project mutations and all event handlers)
  const {
    handleKeyboardSizeChange,
    handleStatusChange,
    handleKeyboardInput,
    handleReconnect,
    handleLayoutModeChange,
    handleAddTab,
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
  });

  // Combined loading state
  const isLoading = activeSessionLoading || sessionsLoading || projectsLoading;

  // Available layouts based on viewport width
  const availableLayouts = useAvailableLayouts();

  // Unified slots array for split-pane terminals
  const terminalSlots: TerminalSlot[] = useMemo(() => {
    const slots: TerminalSlot[] = [];

    for (const pt of projectTerminals) {
      const claudeState = pt.claudeSession?.claude_state;
      slots.push({
        type: "project",
        projectId: pt.projectId,
        projectName: pt.projectName,
        rootPath: pt.rootPath,
        activeMode: pt.activeMode,
        shellSessionId: pt.shellSessionId,
        claudeSessionId: pt.claudeSessionId,
        claudeState,
      });
    }

    for (const session of adHocSessions) {
      slots.push({
        type: "adhoc",
        sessionId: session.id,
        name: session.name,
        workingDir: session.working_dir,
      });
    }

    return slots;
  }, [projectTerminals, adHocSessions]);

  // Slot ordering for grid layout drag-and-drop
  const { orderedIds, reorder } = useSlotOrdering(terminalSlots);

  // Helper to check if current layout is a grid mode
  const isGridMode = layoutMode.startsWith("grid-");

  // Number of panes to show in split mode
  const splitPaneCount = Math.min(terminalSlots.length, MAX_SPLIT_PANES);

  // Get active terminal status
  const activeStatus = activeSessionId ? terminalStatuses.get(activeSessionId) : undefined;
  const showReconnect = activeStatus && ["disconnected", "error", "timeout"].includes(activeStatus);

  // Auto-downgrade layout if current mode is no longer available
  useEffect(() => {
    if (!availableLayouts.includes(layoutMode)) {
      const highest = availableLayouts[availableLayouts.length - 1] || "single";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync layout to viewport constraints
      setLayoutMode(highest);
    }
  }, [availableLayouts, layoutMode, setLayoutMode]);

  // Auto-create terminal on initial load
  useEffect(() => {
    if (isLoading || hasAutoCreated.current || isCreating) return;

    const sessionKey = `terminal-autocreated-${projectId || 'default'}`;
    const alreadyCreated = sessionStorage.getItem(sessionKey);

    if (sessions.length === 0 && !alreadyCreated) {
      hasAutoCreated.current = true;
      sessionStorage.setItem(sessionKey, 'true');
      create("Terminal 1", projectPath);
    }
  }, [isLoading, sessions.length, isCreating, create, projectPath, projectId]);

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
    splitPaneCount,

    // Terminal slots
    terminalSlots,
    orderedIds,
    reorder,

    // Terminal refs and statuses
    terminalRefs,
    terminalStatuses,
    projectTabRefs,
    setTerminalRef,

    // Settings
    fontId,
    fontSize,
    fontFamily,
    setFontId,
    setFontSize,
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

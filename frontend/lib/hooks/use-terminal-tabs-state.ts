"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TerminalHandle, ConnectionStatus } from "@/components/Terminal";
import { LayoutMode } from "@/components/LayoutModeButton";
import { useTerminalSessions } from "@/lib/hooks/use-terminal-sessions";
import { useActiveSession } from "@/lib/hooks/use-active-session";
import { useTerminalSettings } from "@/lib/hooks/use-terminal-settings";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useProjectTerminals, ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { useClaudePolling } from "@/lib/hooks/use-claude-polling";
import { useTabEditing } from "@/lib/hooks/use-tab-editing";
import { useProjectModeSwitch } from "@/lib/hooks/use-project-mode-switch";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { createProjectSession, getNextTerminalName, getProjectSessionId } from "@/lib/utils/session";
import { KeyboardSizePreset } from "@/components/SettingsDropdown";
import { type TerminalSlot } from "@/lib/utils/slot";
import { useAvailableLayouts } from "@/lib/hooks/use-available-layouts";
import { useSlotOrdering } from "@/lib/hooks/use-slot-ordering";

// Maximum number of split panes
const MAX_SPLIT_PANES = 4;

// Init delay for tmux session
const TMUX_INIT_DELAY_MS = 300;

interface UseTerminalTabsStateProps {
  projectId?: string;
  projectPath?: string;
}

export function useTerminalTabsState({ projectId, projectPath }: UseTerminalTabsStateProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-based active session (single source of truth)
  const {
    activeSessionId,
    switchToSession,
    sessions,
    projectTerminals,
    adHocSessions,
    isLoading: activeSessionLoading,
  } = useActiveSession();

  // Session mutations (create, update, delete, reset)
  const {
    create,
    update,
    remove,
    reset,
    resetAll,
    isLoading: sessionsLoading,
    isCreating,
  } = useTerminalSessions(projectId);

  // Project terminal operations (mode switch, reset, disable)
  const {
    switchMode,
    resetProject,
    disableProject,
    isLoading: projectsLoading,
  } = useProjectTerminals();

  // Combined loading state
  const isLoading = activeSessionLoading || sessionsLoading || projectsLoading;

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

  // Claude polling hook
  const { startClaude } = useClaudePolling();

  // Project mode switch hook
  const { switchProjectMode } = useProjectModeSwitch({
    switchMode,
    sessions,
    projectTabRefs,
  });

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

  // Keyboard size handler
  const handleKeyboardSizeChange = useCallback((size: KeyboardSizePreset) => {
    setKeyboardSize(size);
  }, [setKeyboardSize]);

  // Status change handler
  const handleStatusChange = useCallback((sessionId: string, status: ConnectionStatus) => {
    setTerminalStatuses((prev) => {
      const next = new Map(prev);
      next.set(sessionId, status);
      return next;
    });
  }, []);

  // Keyboard input handler
  const handleKeyboardInput = useCallback((data: string) => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.sendInput(data);
    }
  }, [activeSessionId]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.reconnect();
    }
  }, [activeSessionId]);

  // Layout mode change handler
  const handleLayoutModeChange = useCallback(async (mode: LayoutMode) => {
    if (mode !== "single" && sessions.length === 1) {
      const name = getNextTerminalName(sessions);
      await create(name, projectPath);
    }
    setLayoutMode(mode);
  }, [sessions, create, projectPath, setLayoutMode]);

  // Add new terminal (ad-hoc)
  const handleAddTab = useCallback(async () => {
    const name = getNextTerminalName(sessions);
    await create(name, undefined, undefined, true);
  }, [sessions, create]);

  // Navigate to session via URL
  const navigateToSession = useCallback((sessionId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", sessionId);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Project tab click handler
  const handleProjectTabClick = useCallback(async (pt: ProjectTerminal) => {
    const currentSessionId = getProjectSessionId(pt);
    if (currentSessionId) {
      navigateToSession(currentSessionId);
    } else {
      try {
        const newSession = await createProjectSession({
          projectId: pt.projectId,
          mode: pt.activeMode,
          workingDir: pt.rootPath,
        });

        navigateToSession(newSession.id);

        if (pt.activeMode === "claude") {
          await new Promise(resolve => setTimeout(resolve, TMUX_INIT_DELAY_MS));
          await startClaude(newSession.id);
        }
      } catch {
        // Error already logged by createProjectSession
      }
    }
  }, [navigateToSession, startClaude]);

  // Project mode change handler
  const handleProjectModeChange = useCallback(
    async (
      projectId: string,
      newMode: "shell" | "claude",
      currentShellSessionId: string | null,
      currentClaudeSessionId: string | null,
      rootPath: string | null
    ): Promise<void> => {
      await switchProjectMode({
        projectId,
        mode: newMode,
        shellSessionId: currentShellSessionId,
        claudeSessionId: currentClaudeSessionId,
        rootPath,
      });
    },
    [switchProjectMode]
  );

  // Close all terminals handler
  const handleCloseAll = useCallback(async () => {
    for (const session of adHocSessions) {
      await remove(session.id);
    }
    for (const pt of projectTerminals) {
      await disableProject(pt.projectId);
    }
  }, [adHocSessions, projectTerminals, remove, disableProject]);

  // Terminal ref setter
  const setTerminalRef = useCallback((sessionId: string, handle: TerminalHandle | null) => {
    if (handle) {
      terminalRefs.current.set(sessionId, handle);
    } else {
      terminalRefs.current.delete(sessionId);
    }
  }, []);

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

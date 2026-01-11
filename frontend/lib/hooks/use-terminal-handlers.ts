"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { TerminalHandle, ConnectionStatus } from "@/components/Terminal";
import {
  TerminalSession,
  useTerminalSessions,
} from "@/lib/hooks/use-terminal-sessions";
import {
  useProjectTerminals,
  ProjectTerminal,
} from "@/lib/hooks/use-project-terminals";
import { useClaudePolling } from "@/lib/hooks/use-claude-polling";
import { useProjectModeSwitch } from "@/lib/hooks/use-project-mode-switch";
import { getNextTerminalName, getProjectSessionId } from "@/lib/utils/session";
import { TerminalPane } from "@/lib/hooks/use-terminal-panes";
import { LayoutMode } from "@/components/LayoutModeButton";
import { KeyboardSizePreset } from "@/components/SettingsDropdown";

// Init delay for tmux session
const TMUX_INIT_DELAY_MS = 300;

interface UseTerminalHandlersProps {
  projectId?: string;
  projectPath?: string;
  sessions: TerminalSession[];
  adHocSessions: TerminalSession[];
  projectTerminals: ProjectTerminal[];
  activeSessionId: string | null;
  terminalRefs: React.MutableRefObject<Map<string, TerminalHandle>>;
  projectTabRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
  setTerminalStatuses: React.Dispatch<
    React.SetStateAction<Map<string, ConnectionStatus>>
  >;
  setLayoutMode: (mode: LayoutMode) => void;
  setKeyboardSize: (size: KeyboardSizePreset) => void;
  // Pane operations (new architecture)
  panes: TerminalPane[];
  panesAtLimit: boolean;
  createProjectPane: (
    paneName: string,
    projectId: string,
    workingDir?: string,
  ) => Promise<TerminalPane>;
  createAdHocPane: (
    paneName: string,
    workingDir?: string,
  ) => Promise<TerminalPane>;
  setActiveMode: (
    paneId: string,
    mode: "shell" | "claude",
  ) => Promise<TerminalPane>;
  removePane: (paneId: string) => Promise<void>;
}

interface UseTerminalHandlersReturn {
  handleKeyboardSizeChange: (size: KeyboardSizePreset) => void;
  handleStatusChange: (sessionId: string, status: ConnectionStatus) => void;
  handleKeyboardInput: (data: string) => void;
  handleReconnect: () => void;
  handleLayoutModeChange: (mode: LayoutMode) => Promise<void>;
  handleAddTab: () => Promise<void>;
  handleNewTerminalForProject: (
    projectId: string,
    mode: "shell" | "claude",
    rootPath?: string | null,
  ) => Promise<void>;
  handleProjectTabClick: (pt: ProjectTerminal) => Promise<void>;
  handleProjectModeChange: (
    projectId: string,
    newMode: "shell" | "claude",
    projectSessions: TerminalSession[],
    rootPath: string | null,
    paneId?: string,
  ) => Promise<void>;
  handleCloseAll: () => Promise<void>;
  setTerminalRef: (sessionId: string, handle: TerminalHandle | null) => void;
  navigateToSession: (sessionId: string) => void;
  // Exposed from sub-hooks for passthrough
  create: ReturnType<typeof useTerminalSessions>["create"];
  update: ReturnType<typeof useTerminalSessions>["update"];
  remove: ReturnType<typeof useTerminalSessions>["remove"];
  reset: ReturnType<typeof useTerminalSessions>["reset"];
  resetAll: ReturnType<typeof useTerminalSessions>["resetAll"];
  resetProject: ReturnType<typeof useProjectTerminals>["resetProject"];
  disableProject: ReturnType<typeof useProjectTerminals>["disableProject"];
  switchMode: ReturnType<typeof useProjectTerminals>["switchMode"];
  isCreating: boolean;
  sessionsLoading: boolean;
  projectsLoading: boolean;
}

export function useTerminalHandlers({
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
}: UseTerminalHandlersProps): UseTerminalHandlersReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Session mutations
  const {
    create,
    update,
    remove,
    reset,
    resetAll,
    isLoading: sessionsLoading,
    isCreating,
  } = useTerminalSessions(projectId);

  // Project terminal operations
  const {
    switchMode,
    resetProject,
    disableProject,
    isLoading: projectsLoading,
  } = useProjectTerminals();

  // Claude polling
  const { startClaude } = useClaudePolling();

  // Project mode switch
  const { switchProjectMode } = useProjectModeSwitch({
    switchMode,
    projectTabRefs,
    panes,
    setActiveMode,
  });

  // Keyboard size handler
  const handleKeyboardSizeChange = useCallback(
    (size: KeyboardSizePreset) => {
      setKeyboardSize(size);
    },
    [setKeyboardSize],
  );

  // Status change handler
  const handleStatusChange = useCallback(
    (sessionId: string, status: ConnectionStatus) => {
      setTerminalStatuses((prev) => {
        const next = new Map(prev);
        next.set(sessionId, status);
        return next;
      });
    },
    [setTerminalStatuses],
  );

  // Keyboard input handler
  const handleKeyboardInput = useCallback(
    (data: string) => {
      if (activeSessionId) {
        const terminalRef = terminalRefs.current.get(activeSessionId);
        terminalRef?.sendInput(data);
      }
    },
    [activeSessionId, terminalRefs],
  );

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.reconnect();
    }
  }, [activeSessionId, terminalRefs]);

  // Layout mode change handler (single mode removed - always grid)
  const handleLayoutModeChange = useCallback(
    async (mode: LayoutMode) => {
      setLayoutMode(mode);
    },
    [setLayoutMode],
  );

  // Navigate to session via URL
  const navigateToSession = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", sessionId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  // Add new terminal (ad-hoc) - uses pane API
  const handleAddTab = useCallback(async () => {
    if (panesAtLimit) {
      console.warn("Cannot add pane: at maximum limit");
      return;
    }

    // Generate proper badge name based on existing ad-hoc panes
    const adHocCount = panes.filter((p) => p.pane_type === "adhoc").length;
    const paneName =
      adHocCount === 0
        ? "Ad-Hoc Terminal"
        : `Ad-Hoc Terminal [${adHocCount + 1}]`;

    try {
      const newPane = await createAdHocPane(paneName);
      // Navigate to the new session
      const shellSession = newPane.sessions.find((s) => s.mode === "shell");
      if (shellSession) {
        navigateToSession(shellSession.id);
      }
    } catch (error) {
      console.error("Failed to create ad-hoc pane:", error);
    }
  }, [panes, panesAtLimit, createAdHocPane, navigateToSession]);

  // Add new terminal for a specific project (always creates new pane)
  const handleNewTerminalForProject = useCallback(
    async (
      targetProjectId: string,
      mode: "shell" | "claude",
      rootPath?: string | null,
    ) => {
      // Check pane limit
      if (panesAtLimit) {
        console.warn("Cannot add pane: at maximum limit");
        return;
      }

      // Use provided rootPath, or look up from projectTerminals
      let workingDir = rootPath;
      if (workingDir === undefined) {
        const project = projectTerminals.find(
          (p) => p.projectId === targetProjectId,
        );
        if (!project) return;
        workingDir = project.rootPath;
      }

      try {
        // Generate pane name with badge if another pane for this project exists
        const existingPanesForProject = panes.filter(
          (p) => p.project_id === targetProjectId,
        );
        const projectName =
          targetProjectId.charAt(0).toUpperCase() + targetProjectId.slice(1);
        const paneName =
          existingPanesForProject.length === 0
            ? projectName
            : `${projectName} [${existingPanesForProject.length + 1}]`;

        // Create new pane (automatically creates shell + claude sessions)
        const newPane = await createProjectPane(
          paneName,
          targetProjectId,
          workingDir ?? undefined,
        );

        // Find the session for the requested mode
        const targetSession = newPane.sessions.find((s) => s.mode === mode);
        if (!targetSession) {
          console.error("New pane missing session for mode:", mode);
          return;
        }

        // Navigate to the new session
        navigateToSession(targetSession.id);

        // If switching to claude mode, start Claude
        if (mode === "claude") {
          await new Promise((resolve) =>
            setTimeout(resolve, TMUX_INIT_DELAY_MS),
          );
          await startClaude(targetSession.id);
        }
      } catch (error) {
        console.error("Failed to create project pane:", error);
      }
    },
    [
      projectTerminals,
      panes,
      panesAtLimit,
      createProjectPane,
      navigateToSession,
      startClaude,
    ],
  );

  // Project tab click handler (navigates to existing pane's session)
  const handleProjectTabClick = useCallback(
    async (pt: ProjectTerminal) => {
      // First try the legacy path (for backwards compatibility)
      const legacySessionId = getProjectSessionId(pt);
      if (legacySessionId) {
        navigateToSession(legacySessionId);
        return;
      }

      // Find pane for this project
      const pane = panes.find((p) => p.project_id === pt.projectId);
      if (pane) {
        // Find session for the active mode
        const targetSession = pane.sessions.find(
          (s) => s.mode === pane.active_mode,
        );
        if (targetSession) {
          navigateToSession(targetSession.id);

          // Start Claude if needed
          if (
            pane.active_mode === "claude" &&
            targetSession.is_alive &&
            !sessions.find(
              (s) => s.id === targetSession.id && s.claude_state === "running",
            )
          ) {
            await new Promise((resolve) =>
              setTimeout(resolve, TMUX_INIT_DELAY_MS),
            );
            await startClaude(targetSession.id);
          }
        }
      } else {
        // No pane exists - create one (should rarely happen as auto-create handles this)
        if (panesAtLimit) {
          console.warn("Cannot create pane: at maximum limit");
          return;
        }
        const projectName =
          pt.projectId.charAt(0).toUpperCase() + pt.projectId.slice(1);
        try {
          const newPane = await createProjectPane(
            projectName,
            pt.projectId,
            pt.rootPath ?? undefined,
          );
          const targetSession = newPane.sessions.find(
            (s) => s.mode === pt.activeMode,
          );
          if (targetSession) {
            navigateToSession(targetSession.id);
            if (pt.activeMode === "claude") {
              await new Promise((resolve) =>
                setTimeout(resolve, TMUX_INIT_DELAY_MS),
              );
              await startClaude(targetSession.id);
            }
          }
        } catch (error) {
          console.error("Failed to create project pane:", error);
        }
      }
    },
    [
      panes,
      panesAtLimit,
      sessions,
      createProjectPane,
      navigateToSession,
      startClaude,
    ],
  );

  // Project mode change handler
  const handleProjectModeChange = useCallback(
    async (
      projectIdArg: string,
      newMode: "shell" | "claude",
      projectSessions: TerminalSession[],
      rootPath: string | null,
      paneId?: string,
    ): Promise<void> => {
      await switchProjectMode({
        projectId: projectIdArg,
        mode: newMode,
        projectSessions,
        rootPath,
        paneId,
      });
    },
    [switchProjectMode],
  );

  // Close all terminals handler (deletes all panes, which cascade-deletes sessions)
  const handleCloseAll = useCallback(async () => {
    // Delete all panes - sessions are cascade-deleted via FK constraint
    for (const pane of panes) {
      await removePane(pane.id);
    }

    // Auto-create a new ad-hoc terminal so user isn't left with empty state
    try {
      const newPane = await createAdHocPane("Ad-Hoc Terminal");
      const shellSession = newPane.sessions.find((s) => s.mode === "shell");
      if (shellSession) {
        navigateToSession(shellSession.id);
      }
    } catch (error) {
      console.error("Failed to create ad-hoc pane after close all:", error);
    }
  }, [panes, removePane, createAdHocPane, navigateToSession]);

  // Terminal ref setter
  const setTerminalRef = useCallback(
    (sessionId: string, handle: TerminalHandle | null) => {
      if (handle) {
        terminalRefs.current.set(sessionId, handle);
      } else {
        terminalRefs.current.delete(sessionId);
      }
    },
    [terminalRefs],
  );

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
    // Passthrough from sub-hooks
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
  };
}

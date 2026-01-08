"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TerminalHandle, ConnectionStatus } from "@/components/Terminal";
import { TerminalSession, useTerminalSessions } from "@/lib/hooks/use-terminal-sessions";
import { useProjectTerminals, ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { useClaudePolling } from "@/lib/hooks/use-claude-polling";
import { useProjectModeSwitch } from "@/lib/hooks/use-project-mode-switch";
import { createProjectSession, getNextTerminalName, getProjectSessionId } from "@/lib/utils/session";
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
  setTerminalStatuses: React.Dispatch<React.SetStateAction<Map<string, ConnectionStatus>>>;
  setLayoutMode: (mode: LayoutMode) => void;
  setKeyboardSize: (size: KeyboardSizePreset) => void;
}

interface UseTerminalHandlersReturn {
  handleKeyboardSizeChange: (size: KeyboardSizePreset) => void;
  handleStatusChange: (sessionId: string, status: ConnectionStatus) => void;
  handleKeyboardInput: (data: string) => void;
  handleReconnect: () => void;
  handleLayoutModeChange: (mode: LayoutMode) => Promise<void>;
  handleAddTab: () => Promise<void>;
  handleNewTerminalForProject: (projectId: string, mode: "shell" | "claude") => Promise<void>;
  handleProjectTabClick: (pt: ProjectTerminal) => Promise<void>;
  handleProjectModeChange: (
    projectId: string,
    newMode: "shell" | "claude",
    projectSessions: TerminalSession[],
    rootPath: string | null
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
}: UseTerminalHandlersProps): UseTerminalHandlersReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  }, [setTerminalStatuses]);

  // Keyboard input handler
  const handleKeyboardInput = useCallback((data: string) => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.sendInput(data);
    }
  }, [activeSessionId, terminalRefs]);

  // Reconnect handler
  const handleReconnect = useCallback(() => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.reconnect();
    }
  }, [activeSessionId, terminalRefs]);

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

  // Add new terminal for a specific project
  const handleNewTerminalForProject = useCallback(async (
    targetProjectId: string,
    mode: "shell" | "claude"
  ) => {
    const project = projectTerminals.find((p) => p.projectId === targetProjectId);
    if (!project) return;

    try {
      const newSession = await createProjectSession({
        projectId: targetProjectId,
        mode,
        workingDir: project.rootPath,
      });

      navigateToSession(newSession.id);

      if (mode === "claude") {
        await new Promise(resolve => setTimeout(resolve, TMUX_INIT_DELAY_MS));
        await startClaude(newSession.id);
      }
    } catch {
      // Error already logged by createProjectSession
    }
  }, [projectTerminals, navigateToSession, startClaude]);

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
      projectIdArg: string,
      newMode: "shell" | "claude",
      projectSessions: TerminalSession[],
      rootPath: string | null
    ): Promise<void> => {
      await switchProjectMode({
        projectId: projectIdArg,
        mode: newMode,
        projectSessions,
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
  }, [terminalRefs]);

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

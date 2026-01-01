"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Group } from "react-resizable-panels";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { Plus, Loader2 } from "lucide-react";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { LayoutMode } from "./LayoutModeButton";
import { TabBar } from "./TabBar";
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
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { KeyboardSizePreset } from "./SettingsDropdown";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { SplitPane } from "./SplitPane";
import {
  type TerminalSlot,
  type ProjectSlot,
  type AdHocSlot,
} from "@/lib/utils/slot";

// Maximum number of split panes
const MAX_SPLIT_PANES = 4;

// Init delay for tmux session
const TMUX_INIT_DELAY_MS = 300;

interface TerminalTabsProps {
  projectId?: string;
  projectPath?: string;
  className?: string;
}

export function TerminalTabs({ projectId, projectPath, className }: TerminalTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

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

  // Standalone app uses local state for layout (no embedded panel)
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("single");
  const { fontId, fontSize, fontFamily, setFontId, setFontSize } = useTerminalSettings();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [showSettings, setShowSettings] = useState(false);
  const [keyboardSize, setKeyboardSize] = useLocalStorageState<KeyboardSizePreset>("terminal-keyboard-size", "medium");
  const [showTerminalManager, setShowTerminalManager] = useState(false);

  // Unified slots array for split-pane terminals
  const terminalSlots: TerminalSlot[] = useMemo(() => {
    const slots: TerminalSlot[] = [];

    // Add project slots first
    for (const pt of projectTerminals) {
      // Get claude_state from the claude session if it exists
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

    // Add ad-hoc slots
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

  // Auto-create terminal ONLY on initial page load when no sessions exist
  // Uses sessionStorage to prevent re-creating after user closes all terminals
  const hasAutoCreated = useRef(false);
  useEffect(() => {
    // Only run once when loading completes
    if (isLoading || hasAutoCreated.current || isCreating) return;

    // Check if we've already auto-created in this browser tab session
    const sessionKey = `terminal-autocreated-${projectId || 'default'}`;
    const alreadyCreated = sessionStorage.getItem(sessionKey);

    if (sessions.length === 0 && !alreadyCreated) {
      hasAutoCreated.current = true;
      sessionStorage.setItem(sessionKey, 'true');
      create("Terminal 1", projectPath);
    }
  }, [isLoading, sessions.length, isCreating, create, projectPath, projectId]);

  // Handle keyboard size change (localStorage persistence handled by hook)
  const handleKeyboardSizeChange = useCallback((size: KeyboardSizePreset) => {
    setKeyboardSize(size);
  }, [setKeyboardSize]);

  // Terminal refs and connection status tracking
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [terminalStatuses, setTerminalStatuses] = useState<Map<string, ConnectionStatus>>(new Map());

  // Tab refs for scroll into view
  const projectTabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Claude polling hook for starting Claude and polling for state changes
  const { startClaude } = useClaudePolling();

  // Project mode switch hook - orchestrates mode changes with session creation and Claude startup
  const { switchProjectMode } = useProjectModeSwitch({
    switchMode,
    sessions,
    projectTabRefs,
  });

  // Get active terminal status for showing reconnect button
  const activeStatus = activeSessionId ? terminalStatuses.get(activeSessionId) : undefined;
  const showReconnect = activeStatus && ["disconnected", "error", "timeout"].includes(activeStatus);

  // Handle reconnect for active terminal
  const handleReconnect = useCallback(() => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.reconnect();
    }
  }, [activeSessionId]);

  // Handle status change from terminal
  const handleStatusChange = useCallback((sessionId: string, status: ConnectionStatus) => {
    setTerminalStatuses((prev) => {
      const next = new Map(prev);
      next.set(sessionId, status);
      return next;
    });
  }, []);

  // Handle input from keyboard bar
  const handleKeyboardInput = useCallback((data: string) => {
    if (activeSessionId) {
      const terminalRef = terminalRefs.current.get(activeSessionId);
      terminalRef?.sendInput(data);
    }
  }, [activeSessionId]);

  // Number of panes to show in split mode (1:1 with slots, capped)
  const splitPaneCount = Math.min(terminalSlots.length, MAX_SPLIT_PANES);

  // Handle layout mode change - create session if needed for split
  const handleLayoutModeChange = useCallback(async (mode: LayoutMode) => {
    if (mode !== "single" && sessions.length === 1) {
      // Create a second terminal before switching to split
      const name = getNextTerminalName(sessions);
      await create(name, projectPath);
    }
    setLayoutMode(mode);
  }, [sessions, create, projectPath, setLayoutMode]);

  // Tab editing hook
  const {
    editingId,
    editValue,
    setEditValue,
    editInputRef,
    startEdit,
    saveEdit,
    cancelEdit,
    handleKeyDown: handleEditKeyDown,
  } = useTabEditing({
    onSave: async (sessionId: string, newName: string) => {
      await update(sessionId, { name: newName });
    },
  });

  // Create new terminal session (ad-hoc / generic)
  const handleAddTab = useCallback(async () => {
    const name = getNextTerminalName(sessions);
    // Pass isGeneric=true to create without project association
    await create(name, undefined, undefined, true);
  }, [sessions, create]);


  // Helper to update URL with session param
  const navigateToSession = useCallback((sessionId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", sessionId);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Helper to start Claude in a session and wait for confirmation (via hook)
  const startClaudeInSession = useCallback(async (sessionId: string): Promise<boolean> => {
    return startClaude(sessionId);
  }, [startClaude]);

  // Handle clicking a project tab - create session if needed
  const handleProjectTabClick = useCallback(async (pt: ProjectTerminal) => {
    const currentSessionId = getProjectSessionId(pt);
    if (currentSessionId) {
      // Session exists, just switch to it via URL
      navigateToSession(currentSessionId);
    } else {
      // Create session for this project using utility function
      try {
        const newSession = await createProjectSession({
          projectId: pt.projectId,
          mode: pt.activeMode,
          workingDir: pt.rootPath,
        });

        // Switch to new session via URL
        navigateToSession(newSession.id);

        // If mode is claude, start Claude after a brief delay
        if (pt.activeMode === "claude") {
          await new Promise(resolve => setTimeout(resolve, TMUX_INIT_DELAY_MS));
          await startClaudeInSession(newSession.id);
        }
      } catch (e) {
        // Error already logged by createProjectSession
      }
    }
  }, [navigateToSession, startClaudeInSession]);

  // Handler for project mode changes - delegates to hook
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

  // Close terminal session
  const handleCloseTab = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await remove(sessionId);
      // Standalone app: no panel to close, session removal is enough
    },
    [remove]
  );

  // Close all terminals (ad-hoc + disable all projects)
  const handleCloseAll = useCallback(async () => {
    // Remove all ad-hoc sessions
    for (const session of adHocSessions) {
      await remove(session.id);
    }
    // Disable all project terminals
    for (const pt of projectTerminals) {
      await disableProject(pt.projectId);
    }
  }, [adHocSessions, projectTerminals, remove, disableProject]);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={clsx("flex flex-col h-full items-center justify-center", className)}
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--term-accent)" }} />
        <span className="mt-2 text-sm" style={{ color: "var(--term-text-muted)" }}>Loading terminals...</span>
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-col h-full min-h-0 overflow-visible", className)}>
      {/* Tab bar - order-2 on mobile (below terminal), order-1 on desktop (above terminal) */}
      <TabBar
        projectTerminals={projectTerminals}
        projectTabRefs={projectTabRefs}
        adHocSessions={adHocSessions}
        activeSessionId={activeSessionId}
        terminalStatuses={terminalStatuses}
        onProjectTabClick={handleProjectTabClick}
        onProjectModeChange={handleProjectModeChange}
        onAdHocTabClick={switchToSession}
        onResetProject={resetProject}
        onDisableProject={disableProject}
        onResetAdHoc={reset}
        onRemoveAdHoc={remove}
        onAddTerminal={() => setShowTerminalManager(true)}
        onReconnect={handleReconnect}
        onResetAll={resetAll}
        onCloseAll={handleCloseAll}
        editingId={editingId}
        editValue={editValue}
        setEditValue={setEditValue}
        editInputRef={editInputRef}
        startEdit={startEdit}
        saveEdit={saveEdit}
        handleEditKeyDown={handleEditKeyDown}
        layoutMode={layoutMode}
        onLayoutModeChange={handleLayoutModeChange}
        fontId={fontId}
        fontSize={fontSize}
        setFontId={setFontId}
        setFontSize={setFontSize}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        keyboardSize={keyboardSize}
        onKeyboardSizeChange={handleKeyboardSizeChange}
        isMobile={isMobile}
        isCreating={isCreating}
        showReconnect={!!showReconnect}
        activeStatus={activeStatus}
        getProjectSessionId={getProjectSessionId}
      />

      {/* Terminal panels - use min-h-0 to allow flex-1 to shrink below content size */}
      {/* order-1 on mobile (above tabs), order-2 on desktop (below tabs) */}
      <div className={clsx(
        "flex-1 min-h-0 relative overflow-hidden",
        isMobile ? "order-1" : "order-2"
      )}>
        {sessions.length === 0 ? (
          // Empty state - just show hint text
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--term-text-muted)" }}
          >
            Click <Plus className="w-4 h-4 mx-1 inline" /> to start a terminal
          </div>
        ) : layoutMode === "single" ? (
          // Single pane - show active session
          sessions.map((session) => {
            // Show loading overlay for claude sessions that aren't running yet
            const showClaudeOverlay = session.mode === "claude" &&
              session.claude_state !== "running" &&
              session.claude_state !== "stopped" &&
              session.claude_state !== "error";

            return (
              <div
                key={session.id}
                className={clsx(
                  "absolute inset-0 overflow-hidden",
                  session.id === activeSessionId ? "z-10 visible" : "z-0 invisible"
                )}
              >
                <TerminalComponent
                  ref={(handle) => {
                    if (handle) {
                      terminalRefs.current.set(session.id, handle);
                    } else {
                      terminalRefs.current.delete(session.id);
                    }
                  }}
                  sessionId={session.id}
                  workingDir={session.working_dir || projectPath}
                  className="h-full"
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  onStatusChange={(status) => handleStatusChange(session.id, status)}
                />
                {/* Claude loading overlay - hides terminal until Claude is ready */}
                {showClaudeOverlay && <ClaudeLoadingOverlay variant="normal" />}
              </div>
            );
          })
        ) : (
          // Split pane layout - 1:1 mapping with terminal slots
          <Group
            orientation={layoutMode === "horizontal" ? "vertical" : "horizontal"}
            className="h-full"
          >
            {terminalSlots.slice(0, splitPaneCount).map((slot, index) => {
              const key = slot.type === "project" ? `project-${slot.projectId}` : `adhoc-${slot.sessionId}`;
              return (
                <SplitPane
                  key={key}
                  slot={slot}
                  layoutMode={layoutMode}
                  isLast={index === splitPaneCount - 1}
                  paneCount={splitPaneCount}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  onTerminalRef={(sessionId, handle) => {
                    if (handle) {
                      terminalRefs.current.set(sessionId, handle);
                    } else {
                      terminalRefs.current.delete(sessionId);
                    }
                  }}
                  onStatusChange={(sessionId, status) => handleStatusChange(sessionId, status)}
                  onModeChange={(projectId, mode, shellId, claudeId, rootPath) =>
                    handleProjectModeChange(projectId, mode, shellId, claudeId, rootPath)
                  }
                />
              );
            })}
          </Group>
        )}
      </div>

      {/* Mobile keyboard - only on mobile, order-3 (at bottom) */}
      {isMobile && sessions.length > 0 && (
        <div className="order-3">
          <MobileKeyboard
            onSend={handleKeyboardInput}
            connectionStatus={activeStatus}
            onReconnect={handleReconnect}
            keyboardSize={keyboardSize}
          />
        </div>
      )}

      {/* Terminal Manager Modal */}
      <TerminalManagerModal
        isOpen={showTerminalManager}
        onClose={() => setShowTerminalManager(false)}
        onCreateGenericTerminal={handleAddTab}
      />
    </div>
  );
}

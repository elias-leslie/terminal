"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { Plus, X, Terminal as TerminalIcon, Loader2, RefreshCw } from "lucide-react";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { LayoutModeButtons, LayoutMode } from "./LayoutModeButton";
import { useTerminalSessions } from "@/lib/hooks/use-terminal-sessions";
import { useActiveSession } from "@/lib/hooks/use-active-session";
import { useTerminalSettings } from "@/lib/hooks/use-terminal-settings";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useProjectTerminals, ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { SettingsDropdown, KeyboardSizePreset } from "./SettingsDropdown";
import { ClaudeIndicator } from "./ClaudeIndicator";
import { TabModeDropdown } from "./TabModeDropdown";
import { TabActionMenu } from "./TabActionMenu";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { GlobalActionMenu } from "./GlobalActionMenu";

// Maximum number of split panes
const MAX_SPLIT_PANES = 4;

// Claude polling constants
const CLAUDE_POLL_INTERVAL_MS = 500;  // Poll interval for Claude state check
const CLAUDE_POLL_TIMEOUT_MS = 10000; // Max time to poll before giving up
const TMUX_INIT_DELAY_MS = 300;       // Delay for tmux session initialization

// Helper to get next terminal name (Terminal 1, Terminal 2, etc.)
function getNextTerminalName(sessions: Array<{ name: string }>): string {
  // Find the highest "Terminal N" number
  let maxNum = 0;
  for (const session of sessions) {
    const match = session.name.match(/^Terminal\s+(\d+)$/i);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `Terminal ${maxNum + 1}`;
}

// Slot types for split-pane terminals
interface ProjectSlot {
  type: "project";
  projectId: string;
  projectName: string;
  rootPath: string | null;
  activeMode: "shell" | "claude";
  shellSessionId: string | null;
  claudeSessionId: string | null;
  // Claude state for overlay (from the claude session if in claude mode)
  claudeState?: "not_started" | "starting" | "running" | "stopped" | "error";
}

interface AdHocSlot {
  type: "adhoc";
  sessionId: string;
  name: string;
  workingDir: string | null;
}

type TerminalSlot = ProjectSlot | AdHocSlot;

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
  const [keyboardSize, setKeyboardSize] = useState<KeyboardSizePreset>("medium");
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

  // Load keyboard size from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("terminal-keyboard-size");
    if (stored === "small" || stored === "medium" || stored === "large") {
      setKeyboardSize(stored);
    }
  }, []);

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

  // Save keyboard size to localStorage
  const handleKeyboardSizeChange = useCallback((size: KeyboardSizePreset) => {
    setKeyboardSize(size);
    localStorage.setItem("terminal-keyboard-size", size);
  }, []);

  // Terminal refs and connection status tracking
  const terminalRefs = useRef<Map<string, TerminalHandle>>(new Map());
  const [terminalStatuses, setTerminalStatuses] = useState<Map<string, ConnectionStatus>>(new Map());

  // Tab refs for scroll into view
  const projectTabRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Claude state polling interval ref for cleanup
  const claudePollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Cleanup Claude polling interval on unmount
  useEffect(() => {
    return () => {
      if (claudePollIntervalRef.current) {
        clearInterval(claudePollIntervalRef.current);
        claudePollIntervalRef.current = null;
      }
    };
  }, []);

  // Create new terminal session (ad-hoc)
  const handleAddTab = useCallback(async () => {
    const name = getNextTerminalName(sessions);
    await create(name, projectPath);
  }, [sessions, create, projectPath]);

  // Get current session ID for a project based on activeMode
  const getProjectSessionId = useCallback((pt: ProjectTerminal): string | null => {
    return pt.activeMode === "claude" ? pt.claudeSessionId : pt.shellSessionId;
  }, []);

  // Helper to update URL with session param
  const navigateToSession = useCallback((sessionId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", sessionId);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // Helper to start Claude in a session and wait for confirmation
  const startClaudeInSession = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/terminal/sessions/${sessionId}/start-claude`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("Failed to start Claude:", await res.text());
        return false;
      }
      const data = await res.json();

      // Invalidate sessions query to pick up new claude_state
      // This ensures the overlay updates when state changes
      queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });

      // If Claude is starting, poll for completion
      if (data.claude_state === "starting") {
        // Clear any existing polling interval
        if (claudePollIntervalRef.current) {
          clearInterval(claudePollIntervalRef.current);
        }

        // Poll until Claude is running (or timeout)
        const pollStart = Date.now();
        claudePollIntervalRef.current = setInterval(async () => {
          if (Date.now() - pollStart > CLAUDE_POLL_TIMEOUT_MS) {
            if (claudePollIntervalRef.current) {
              clearInterval(claudePollIntervalRef.current);
              claudePollIntervalRef.current = null;
            }
            return;
          }
          // Fetch latest state
          const stateRes = await fetch(`/api/terminal/sessions/${sessionId}/claude-state`);
          if (stateRes.ok) {
            const stateData = await stateRes.json();
            if (stateData.claude_state === "running" || stateData.claude_state === "error") {
              if (claudePollIntervalRef.current) {
                clearInterval(claudePollIntervalRef.current);
                claudePollIntervalRef.current = null;
              }
              // Invalidate to update UI
              queryClient.invalidateQueries({ queryKey: ["terminal-sessions"] });
            }
          }
        }, CLAUDE_POLL_INTERVAL_MS);
      }

      // Return true if started or already running
      return data.started || data.message?.includes("already running");
    } catch (e) {
      console.error("Failed to start Claude:", e);
      return false;
    }
  }, [queryClient]);

  // Handle clicking a project tab - create session if needed
  const handleProjectTabClick = useCallback(async (pt: ProjectTerminal) => {
    const currentSessionId = getProjectSessionId(pt);
    if (currentSessionId) {
      // Session exists, just switch to it via URL
      navigateToSession(currentSessionId);
    } else {
      // Create session for this project via direct API call (includes project_id and mode)
      try {
        const res = await fetch("/api/terminal/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Project: ${pt.projectId}`,
            project_id: pt.projectId,
            working_dir: pt.rootPath,
            mode: pt.activeMode,
          }),
        });
        if (!res.ok) throw new Error("Failed to create session");
        const newSession = await res.json();

        // Switch to new session via URL
        navigateToSession(newSession.id);

        // If mode is claude, start Claude after a brief delay
        if (pt.activeMode === "claude") {
          await new Promise(resolve => setTimeout(resolve, TMUX_INIT_DELAY_MS));
          await startClaudeInSession(newSession.id);
        }
      } catch (e) {
        console.error("Failed to create project session:", e);
      }
    }
  }, [navigateToSession, getProjectSessionId, startClaudeInSession]);

  // Atomic mode switch handler for project tabs
  // Encapsulates: 1) Update backend mode, 2) Get/create session, 3) Start Claude if needed, 4) Switch via URL
  const handleProjectModeChange = useCallback(async (
    projectId: string,
    newMode: "shell" | "claude",
    currentShellSessionId: string | null,
    currentClaudeSessionId: string | null,
    rootPath: string | null
  ): Promise<void> => {
    // 1. Update mode in backend (optimistic update happens in switchMode)
    await switchMode(projectId, newMode);

    // 2. Determine which session to use
    let targetSessionId = newMode === "claude" ? currentClaudeSessionId : currentShellSessionId;
    let needsClaudeStart = false;
    let isNewSession = false;

    // 3. Create session if it doesn't exist
    if (!targetSessionId) {
      const res = await fetch("/api/terminal/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Project: ${projectId}`,
          project_id: projectId,
          working_dir: rootPath,
          mode: newMode,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to create session");
      }
      const newSession = await res.json();
      targetSessionId = newSession.id;
      isNewSession = true;
      // New claude session always needs Claude started
      if (newMode === "claude") {
        needsClaudeStart = true;
      }
    } else if (newMode === "claude") {
      // Existing claude session - check if Claude is already running
      // Look up session in the cache to check claude_state
      const existingSession = sessions.find(s => s.id === targetSessionId);
      const claudeState = existingSession?.claude_state;
      // Only start Claude if NOT already running or starting
      needsClaudeStart = claudeState !== "running" && claudeState !== "starting";
    }

    // 4. If switching to Claude mode AND Claude needs to be started
    if (newMode === "claude" && targetSessionId && needsClaudeStart) {
      // Delay for new sessions to let tmux initialize
      if (isNewSession) {
        await new Promise(resolve => setTimeout(resolve, TMUX_INIT_DELAY_MS));
      }
      await startClaudeInSession(targetSessionId);
    }

    // 5. Switch to the session via URL
    if (targetSessionId) {
      navigateToSession(targetSessionId);
    }

    // 6. Scroll tab into view after mode switch
    setTimeout(() => {
      projectTabRefs.current.get(projectId)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }, 100);
  }, [switchMode, startClaudeInSession, navigateToSession, sessions]);

  // Close terminal session
  const handleCloseTab = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await remove(sessionId);
      // Standalone app: no panel to close, session removal is enough
    },
    [remove]
  );

  // Start editing tab name
  const handleStartEdit = useCallback((sessionId: string, currentName: string) => {
    setEditingId(sessionId);
    setEditValue(currentName);
  }, []);

  // Save edited name
  const handleSaveEdit = useCallback(async () => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null);
      return;
    }

    await update(editingId, { name: editValue.trim() });
    setEditingId(null);
  }, [editingId, editValue, update]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

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

  // Handle keyboard events in edit mode
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

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
      <div
        className={clsx(
          "flex-shrink-0 flex items-center overflow-x-auto overflow-y-visible",
          isMobile
            ? "order-2 gap-1 px-1.5 py-1"  // Compact on mobile
            : "order-1 gap-1.5 px-2 py-1.5"
        )}
        style={{ backgroundColor: "var(--term-bg-surface)", borderColor: "var(--term-border)" }}
      >
        {/* Project tabs first */}
        {projectTerminals.map((pt) => {
          const currentSessionId = getProjectSessionId(pt);
          const sessionStatus = currentSessionId ? terminalStatuses.get(currentSessionId) : undefined;
          const isActive = currentSessionId === activeSessionId;

          return (
            <div
              key={pt.projectId}
              ref={(el) => {
                if (el) {
                  projectTabRefs.current.set(pt.projectId, el);
                } else {
                  projectTabRefs.current.delete(pt.projectId);
                }
              }}
              onClick={() => handleProjectTabClick(pt)}
              className={clsx(
                "flex items-center rounded-md transition-all duration-200 cursor-pointer",
                "group min-w-0 flex-shrink-0",
                isMobile
                  ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
                  : "gap-1.5 px-2 py-1.5 text-sm",
                isActive
                  ? "tab-active"
                  : "tab-inactive"
              )}
            >
              {/* Claude indicator for project tabs */}
              <ClaudeIndicator state={pt.activeMode === "claude" ? "idle" : "none"} />
              {/* Project name */}
              <span className={clsx("truncate", isMobile ? "max-w-[80px]" : "max-w-[100px]")}>
                {pt.projectName}
              </span>
              {/* Mode dropdown - stop propagation to prevent tab click */}
              <div onClick={(e) => e.stopPropagation()}>
                <TabModeDropdown
                  value={pt.activeMode}
                  onChange={(mode) => handleProjectModeChange(
                    pt.projectId,
                    mode,
                    pt.shellSessionId,
                    pt.claudeSessionId,
                    pt.rootPath
                  )}
                  isMobile={isMobile}
                />
              </div>
              {/* Action menu - stop propagation to prevent tab click */}
              <div onClick={(e) => e.stopPropagation()}>
                <TabActionMenu
                  tabType="project"
                  onReset={() => resetProject(pt.projectId)}
                  onClose={() => disableProject(pt.projectId)}
                  isMobile={isMobile}
                />
              </div>
            </div>
          );
        })}

        {/* Divider between project and ad-hoc tabs */}
        {projectTerminals.length > 0 && adHocSessions.length > 0 && (
          <div
            className="w-px h-5 mx-1 flex-shrink-0"
            style={{ backgroundColor: "var(--term-border)" }}
          />
        )}

        {/* Ad-hoc session tabs */}
        {adHocSessions.map((session) => {
          const sessionStatus = terminalStatuses.get(session.id);
          const isActive = session.id === activeSessionId;

          return (
            <div
              key={session.id}
              onClick={() => switchToSession(session.id)}
              className={clsx(
                "flex items-center rounded-md transition-all duration-200 cursor-pointer",
                "group min-w-0 flex-shrink-0",
                isMobile
                  ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
                  : "gap-1.5 px-2 py-1.5 text-sm",
                isActive
                  ? "tab-active"
                  : "tab-inactive"
              )}
            >
              {/* Status dot for ad-hoc tabs */}
              <span
                className={clsx("w-2 h-2 rounded-full flex-shrink-0", {
                  "animate-pulse": sessionStatus === "connecting",
                })}
                style={{
                  backgroundColor:
                    sessionStatus === "connected" ? "var(--term-accent)" :
                    sessionStatus === "connecting" ? "var(--term-warning)" :
                    sessionStatus === "error" || sessionStatus === "timeout" ? "var(--term-error)" :
                    sessionStatus === "session_dead" ? "var(--term-warning)" :
                    "var(--term-text-muted)",
                  boxShadow: sessionStatus === "connected" ? "0 0 6px var(--term-accent)" : "none",
                }}
                title={sessionStatus || "unknown"}
              />
              {/* Tab content */}
              <div className="flex items-center">
                {editingId === session.id ? (
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={handleEditKeyDown}
                    className="rounded px-1 py-0 text-sm w-24 focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: "var(--term-bg-deep)",
                      borderColor: "var(--term-accent)",
                      color: "var(--term-text-primary)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className={clsx("truncate", isMobile ? "max-w-[80px]" : "max-w-[100px]")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(session.id, session.name);
                    }}
                  >
                    {session.name}
                    {!session.is_alive && " (dead)"}
                  </span>
                )}
              </div>
              {/* Action menu - stop propagation to prevent tab click */}
              <div onClick={(e) => e.stopPropagation()}>
                <TabActionMenu
                  tabType="adhoc"
                  onReset={() => reset(session.id)}
                  onClose={() => remove(session.id)}
                  isMobile={isMobile}
                />
              </div>
            </div>
          );
        })}

        {/* Add new terminal button - opens manager modal */}
        <button
          onClick={() => setShowTerminalManager(true)}
          disabled={isCreating}
          className="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 disabled:opacity-50"
          style={{ color: "var(--term-text-muted)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
            e.currentTarget.style.color = "var(--term-accent)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--term-text-muted)";
          }}
          title="Manage terminals"
        >
          {isCreating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </button>

        {/* Reconnect button - visible when disconnected, hidden on mobile (in control bar) */}
        {showReconnect && !isMobile && (
          <button
            onClick={handleReconnect}
            className="flex items-center gap-1 px-2 py-1.5 text-sm rounded-md transition-all duration-150"
            style={{ color: "var(--term-warning)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Reconnect terminal"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Reconnect</span>
          </button>
        )}


        {/* Layout mode buttons - hidden on mobile */}
        {!isMobile && (
          <div
            className="ml-auto flex items-center gap-0.5 pl-2"
            style={{ borderLeft: "1px solid var(--term-border)" }}
          >
            <LayoutModeButtons layoutMode={layoutMode} onLayoutChange={handleLayoutModeChange} />
          </div>
        )}

        {/* Settings button - always visible, pushed to right on mobile */}
        <div className={clsx("flex items-center gap-1", isMobile && "ml-auto")}>
          {/* Connection status / reconnect - show on mobile */}
          {isMobile && (
            <button
              onClick={handleReconnect}
              disabled={!showReconnect}
              className={clsx(
                "p-1.5 rounded-md transition-all duration-150",
                activeStatus === "connecting" && "animate-pulse"
              )}
              style={{
                color: showReconnect
                  ? "var(--term-warning)"
                  : activeStatus === "connected"
                    ? "var(--term-accent)"
                    : activeStatus === "connecting"
                      ? "var(--term-warning)"
                      : "var(--term-text-muted)",
              }}
              title={showReconnect ? "Reconnect" : `Status: ${activeStatus || "unknown"}`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
          {/* Global action menu */}
          <GlobalActionMenu
            onResetAll={resetAll}
            onCloseAll={handleCloseAll}
            isMobile={isMobile}
          />
          <SettingsDropdown
            fontId={fontId}
            fontSize={fontSize}
            setFontId={setFontId}
            setFontSize={setFontSize}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            keyboardSize={keyboardSize}
            setKeyboardSize={handleKeyboardSizeChange}
            isMobile={isMobile}
          />

          {/* Standalone app: no minimize button (full-page terminal) */}
        </div>
      </div>

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

// Split pane component for cleaner rendering
interface SplitPaneProps {
  slot: TerminalSlot;
  layoutMode: LayoutMode;
  isLast: boolean;
  paneCount: number;
  fontFamily: string;
  fontSize: number;
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  onModeChange?: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
}

function SplitPane({
  slot,
  layoutMode,
  isLast,
  paneCount,
  fontFamily,
  fontSize,
  onTerminalRef,
  onStatusChange,
  onModeChange,
}: SplitPaneProps) {
  const defaultSize = 100 / paneCount;
  const minSize = `${Math.max(10, 100 / (paneCount * 2))}%`;

  // Get session ID and info based on slot type
  const getSessionId = (): string | null => {
    if (slot.type === "project") {
      return slot.activeMode === "claude" ? slot.claudeSessionId : slot.shellSessionId;
    }
    return slot.sessionId;
  };

  const getPanelId = (): string => {
    if (slot.type === "project") {
      return `project-${slot.projectId}`;
    }
    return `adhoc-${slot.sessionId}`;
  };

  const getName = (): string => {
    if (slot.type === "project") {
      return slot.projectName;
    }
    return slot.name;
  };

  const getWorkingDir = (): string | null => {
    if (slot.type === "project") {
      return slot.rootPath;
    }
    return slot.workingDir;
  };

  const sessionId = getSessionId();

  return (
    <>
      <Panel
        id={getPanelId()}
        defaultSize={defaultSize}
        minSize={minSize}
        className="flex flex-col h-full min-h-0 overflow-hidden"
      >
        {/* Small header showing terminal name */}
        <div
          className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            borderBottom: "1px solid var(--term-border)",
          }}
        >
          {/* Mode indicator for projects */}
          {slot.type === "project" && (
            <ClaudeIndicator state={slot.activeMode === "claude" ? "idle" : "none"} />
          )}
          {slot.type === "adhoc" && (
            <TerminalIcon className="w-3 h-3" style={{ color: "var(--term-text-muted)" }} />
          )}
          <span className="text-xs truncate flex-1" style={{ color: "var(--term-text-muted)" }}>
            {getName()}
          </span>
          {/* Mode dropdown for project slots */}
          {slot.type === "project" && onModeChange && (
            <TabModeDropdown
              value={slot.activeMode}
              onChange={(mode) => onModeChange(
                slot.projectId,
                mode,
                slot.shellSessionId,
                slot.claudeSessionId,
                slot.rootPath
              )}
            />
          )}
          {!sessionId && (
            <span className="text-xs" style={{ color: "var(--term-text-muted)" }}>(no session)</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {sessionId ? (
            <>
              <TerminalComponent
                ref={(handle) => onTerminalRef?.(sessionId, handle)}
                sessionId={sessionId}
                workingDir={getWorkingDir() || undefined}
                className="h-full"
                fontFamily={fontFamily}
                fontSize={fontSize}
                onStatusChange={(status) => onStatusChange?.(sessionId, status)}
              />
              {/* Claude loading overlay for split panes */}
              {slot.type === "project" &&
                slot.activeMode === "claude" &&
                slot.claudeState !== "running" &&
                slot.claudeState !== "stopped" &&
                slot.claudeState !== "error" && <ClaudeLoadingOverlay variant="compact" />}
            </>
          ) : (
            <div
              className="flex items-center justify-center h-full text-xs"
              style={{ color: "var(--term-text-muted)", backgroundColor: "var(--term-bg-deep)" }}
            >
              Click tab to start session
            </div>
          )}
        </div>
      </Panel>
      {!isLast && (
        <Separator
          className={clsx(
            layoutMode === "horizontal"
              ? "h-1 cursor-row-resize"
              : "w-1 cursor-col-resize",
            "transition-colors"
          )}
          style={{ backgroundColor: "var(--term-border)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--term-border-active)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--term-border)"; }}
        />
      )}
    </>
  );
}

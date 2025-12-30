"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { Plus, X, Terminal as TerminalIcon, Loader2, RefreshCw } from "lucide-react";
import { LayoutModeButtons, LayoutMode } from "./LayoutModeButton";
import { useTerminalSessions } from "@/lib/hooks/use-terminal-sessions";
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
  const {
    sessions,
    activeId,
    setActiveId,
    create,
    update,
    remove,
    reset,
    resetAll,
    isLoading,
    isCreating,
  } = useTerminalSessions(projectId);

  // Project terminals data
  const {
    projectTerminals,
    adHocSessions,
    isLoading: projectsLoading,
    switchMode,
    resetProject,
    disableProject,
  } = useProjectTerminals();

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
      slots.push({
        type: "project",
        projectId: pt.projectId,
        projectName: pt.projectName,
        rootPath: pt.rootPath,
        activeMode: pt.activeMode,
        shellSessionId: pt.shellSessionId,
        claudeSessionId: pt.claudeSessionId,
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

  // Get active terminal status for showing reconnect button
  const activeStatus = activeId ? terminalStatuses.get(activeId) : undefined;
  const showReconnect = activeStatus && ["disconnected", "error", "timeout"].includes(activeStatus);

  // Handle reconnect for active terminal
  const handleReconnect = useCallback(() => {
    if (activeId) {
      const terminalRef = terminalRefs.current.get(activeId);
      terminalRef?.reconnect();
    }
  }, [activeId]);

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
    if (activeId) {
      const terminalRef = terminalRefs.current.get(activeId);
      terminalRef?.sendInput(data);
    }
  }, [activeId]);

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

  // Create new terminal session (ad-hoc)
  const handleAddTab = useCallback(async () => {
    const name = getNextTerminalName(sessions);
    await create(name, projectPath);
  }, [sessions, create, projectPath]);

  // Get current session ID for a project based on activeMode
  const getProjectSessionId = useCallback((pt: ProjectTerminal): string | null => {
    return pt.activeMode === "claude" ? pt.claudeSessionId : pt.shellSessionId;
  }, []);

  // Handle clicking a project tab - create session if needed
  const handleProjectTabClick = useCallback(async (pt: ProjectTerminal) => {
    const currentSessionId = getProjectSessionId(pt);
    if (currentSessionId) {
      // Session exists, just switch to it
      setActiveId(currentSessionId);
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
        setActiveId(newSession.id);

        // If mode is claude, start Claude after a brief delay
        if (pt.activeMode === "claude") {
          setTimeout(async () => {
            try {
              await fetch(`/api/terminal/sessions/${newSession.id}/start-claude`, {
                method: "POST",
              });
            } catch (e) {
              console.error("Failed to auto-start Claude:", e);
            }
          }, 500);
        }
      } catch (e) {
        console.error("Failed to create project session:", e);
      }
    }
  }, [setActiveId, getProjectSessionId]);

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
          const isActive = currentSessionId === activeId;

          return (
            <div
              key={pt.projectId}
              className={clsx(
                "flex items-center rounded-md transition-all duration-200",
                "group min-w-0 flex-shrink-0",
                isMobile
                  ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
                  : "gap-1.5 px-2 py-1.5 text-sm",
                isActive
                  ? "text-white"
                  : "hover:text-white"
              )}
              style={{
                backgroundColor: isActive ? "var(--term-bg-elevated)" : "transparent",
                color: isActive ? "var(--term-text-primary)" : "var(--term-text-muted)",
                boxShadow: isActive
                  ? "0 0 12px var(--term-accent-glow), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "none",
                border: isActive ? "1px solid var(--term-border-active)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(0, 255, 159, 0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
            >
              {/* Claude indicator for project tabs */}
              <ClaudeIndicator state={pt.activeMode === "claude" ? "idle" : "none"} />
              {/* Clickable name area */}
              <button
                onClick={() => handleProjectTabClick(pt)}
                className={clsx("truncate", isMobile ? "max-w-[80px]" : "max-w-[100px]")}
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              >
                {pt.projectName}
              </button>
              {/* Mode dropdown */}
              <TabModeDropdown
                value={pt.activeMode}
                onChange={(mode) => switchMode(pt.projectId, mode)}
                isMobile={isMobile}
              />
              {/* Action menu */}
              <TabActionMenu
                tabType="project"
                onReset={() => resetProject(pt.projectId)}
                onClose={() => disableProject(pt.projectId)}
                isMobile={isMobile}
              />
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
          const isActive = session.id === activeId;

          return (
            <div
              key={session.id}
              className={clsx(
                "flex items-center rounded-md transition-all duration-200",
                "group min-w-0 flex-shrink-0",
                isMobile
                  ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
                  : "gap-1.5 px-2 py-1.5 text-sm",
                isActive
                  ? "text-white"
                  : "hover:text-white"
              )}
              style={{
                backgroundColor: isActive ? "var(--term-bg-elevated)" : "transparent",
                color: isActive ? "var(--term-text-primary)" : "var(--term-text-muted)",
                boxShadow: isActive
                  ? "0 0 12px var(--term-accent-glow), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "none",
                border: isActive ? "1px solid var(--term-border-active)" : "1px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
                  e.currentTarget.style.boxShadow = "0 0 8px rgba(0, 255, 159, 0.08)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}
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
              {/* Clickable area for tab selection */}
              <button
                onClick={() => setActiveId(session.id)}
                className="flex items-center"
                style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}
              >
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
              </button>
              {/* Action menu */}
              <TabActionMenu
                tabType="adhoc"
                onReset={() => reset(session.id)}
                onClose={() => remove(session.id)}
                isMobile={isMobile}
              />
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
          sessions.map((session) => (
            <div
              key={session.id}
              className={clsx(
                "absolute inset-0 overflow-hidden",
                session.id === activeId ? "z-10 visible" : "z-0 invisible"
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
            </div>
          ))
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
          <span className="text-xs truncate" style={{ color: "var(--term-text-muted)" }}>
            {getName()}
          </span>
          {!sessionId && (
            <span className="text-xs" style={{ color: "var(--term-text-muted)" }}>(no session)</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {sessionId ? (
            <TerminalComponent
              ref={(handle) => onTerminalRef?.(sessionId, handle)}
              sessionId={sessionId}
              workingDir={getWorkingDir() || undefined}
              className="h-full"
              fontFamily={fontFamily}
              fontSize={fontSize}
              onStatusChange={(status) => onStatusChange?.(sessionId, status)}
            />
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

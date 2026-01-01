"use client";

import { RefObject } from "react";
import { clsx } from "clsx";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { ConnectionStatus } from "./Terminal";
import { LayoutModeButtons, LayoutMode } from "./LayoutModeButton";
import { TabActionMenu } from "./TabActionMenu";
import { GlobalActionMenu } from "./GlobalActionMenu";
import { SettingsDropdown, KeyboardSizePreset } from "./SettingsDropdown";
import { ProjectTab } from "./ProjectTab";
import { ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import { TerminalFontId, TerminalFontSize } from "@/lib/hooks/use-terminal-settings";

// ============================================================================
// Utility Functions
// ============================================================================

function getTabClassName(isActive: boolean, isMobile: boolean): string {
  return clsx(
    "flex items-center rounded-md transition-all duration-200 cursor-pointer",
    "group min-w-0 flex-shrink-0",
    isMobile
      ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
      : "gap-1.5 px-2 py-1.5 text-sm",
    isActive
      ? "tab-active"
      : "tab-inactive"
  );
}

// ============================================================================
// Types
// ============================================================================

export interface TabBarProps {
  // Project terminals data
  projectTerminals: ProjectTerminal[];
  projectTabRefs: RefObject<Map<string, HTMLDivElement>>;

  // Ad-hoc sessions data
  adHocSessions: TerminalSession[];

  // Active state
  activeSessionId: string | null;

  // Terminal statuses
  terminalStatuses: Map<string, ConnectionStatus>;

  // Handlers
  onProjectTabClick: (pt: ProjectTerminal) => void;
  onProjectModeChange: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
  onAdHocTabClick: (sessionId: string) => void;
  onResetProject: (projectId: string) => void;
  onDisableProject: (projectId: string) => void;
  onResetAdHoc: (sessionId: string) => void;
  onRemoveAdHoc: (sessionId: string) => void;
  onAddTerminal: () => void;
  onReconnect: () => void;
  onResetAll: () => void;
  onCloseAll: () => void;

  // Tab editing
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  editInputRef: RefObject<HTMLInputElement | null>;
  startEdit: (sessionId: string, currentName: string) => void;
  saveEdit: () => void;
  handleEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  // Layout
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;

  // Settings
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  setFontId: (id: TerminalFontId) => void;
  setFontSize: (size: TerminalFontSize) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  keyboardSize: KeyboardSizePreset;
  onKeyboardSizeChange: (size: KeyboardSizePreset) => void;

  // State
  isMobile: boolean;
  isCreating: boolean;
  showReconnect: boolean;
  activeStatus?: ConnectionStatus;

  // Helper to get session ID for a project
  getProjectSessionId: (pt: ProjectTerminal) => string | null;
}

// ============================================================================
// Component
// ============================================================================

export function TabBar({
  projectTerminals,
  projectTabRefs,
  adHocSessions,
  activeSessionId,
  terminalStatuses,
  onProjectTabClick,
  onProjectModeChange,
  onAdHocTabClick,
  onResetProject,
  onDisableProject,
  onResetAdHoc,
  onRemoveAdHoc,
  onAddTerminal,
  onReconnect,
  onResetAll,
  onCloseAll,
  editingId,
  editValue,
  setEditValue,
  editInputRef,
  startEdit,
  saveEdit,
  handleEditKeyDown,
  layoutMode,
  onLayoutModeChange,
  fontId,
  fontSize,
  setFontId,
  setFontSize,
  showSettings,
  setShowSettings,
  keyboardSize,
  onKeyboardSizeChange,
  isMobile,
  isCreating,
  showReconnect,
  activeStatus,
  getProjectSessionId,
}: TabBarProps) {
  return (
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
        const isActive = currentSessionId === activeSessionId;

        return (
          <ProjectTab
            key={pt.projectId}
            projectTerminal={pt}
            isActive={isActive}
            onClick={() => onProjectTabClick(pt)}
            onModeChange={onProjectModeChange}
            onReset={onResetProject}
            onDisable={onDisableProject}
            tabRef={(el) => {
              if (el) {
                projectTabRefs.current?.set(pt.projectId, el);
              } else {
                projectTabRefs.current?.delete(pt.projectId);
              }
            }}
            isMobile={isMobile}
          />
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
            onClick={() => onAdHocTabClick(session.id)}
            className={getTabClassName(isActive, isMobile)}
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
                  onBlur={saveEdit}
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
                    startEdit(session.id, session.name);
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
                onReset={() => onResetAdHoc(session.id)}
                onClose={() => onRemoveAdHoc(session.id)}
                isMobile={isMobile}
              />
            </div>
          </div>
        );
      })}

      {/* Add new terminal button - opens manager modal */}
      <button
        onClick={onAddTerminal}
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
          onClick={onReconnect}
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
          <LayoutModeButtons layoutMode={layoutMode} onLayoutChange={onLayoutModeChange} />
        </div>
      )}

      {/* Settings button - always visible, pushed to right on mobile */}
      <div className={clsx("flex items-center gap-1", isMobile && "ml-auto")}>
        {/* Connection status / reconnect - show on mobile */}
        {isMobile && (
          <button
            onClick={onReconnect}
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
          onResetAll={onResetAll}
          onCloseAll={onCloseAll}
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
          setKeyboardSize={onKeyboardSizeChange}
          isMobile={isMobile}
        />

        {/* Standalone app: no minimize button (full-page terminal) */}
      </div>
    </div>
  );
}

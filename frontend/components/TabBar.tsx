"use client";

import { memo } from "react";
import { clsx } from "clsx";
import { Plus, Loader2, RefreshCw } from "lucide-react";
import { LayoutModeButtons } from "./LayoutModeButton";
import { GlobalActionMenu } from "./GlobalActionMenu";
import { SettingsDropdown } from "./SettingsDropdown";
import { ProjectTab } from "./ProjectTab";
import { AdHocTab } from "./AdHocTab";
import { SessionInfoIcon } from "./SessionInfoIcon";
import { TabBarProps } from "./tab-bar.types";

export type { TabBarProps } from "./tab-bar.types";

export const TabBar = memo(function TabBar({
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
  availableLayouts,
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
  activeSessionMode,
  activeSessionTimestamp,
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
          <AdHocTab
            key={session.id}
            session={session}
            sessionStatus={sessionStatus}
            isActive={isActive}
            onClick={onAdHocTabClick}
            onReset={onResetAdHoc}
            onRemove={onRemoveAdHoc}
            isEditing={editingId === session.id}
            editValue={editValue}
            setEditValue={setEditValue}
            editInputRef={editInputRef}
            startEdit={startEdit}
            saveEdit={saveEdit}
            handleEditKeyDown={handleEditKeyDown}
            isMobile={isMobile}
          />
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
          <LayoutModeButtons layoutMode={layoutMode} onLayoutChange={onLayoutModeChange} availableLayouts={availableLayouts} />
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
        {/* Session info icon */}
        {activeSessionId && activeSessionMode && (
          <SessionInfoIcon
            sessionId={activeSessionId}
            mode={activeSessionMode}
            timestamp={activeSessionTimestamp}
          />
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
});

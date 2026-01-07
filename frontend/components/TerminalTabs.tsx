"use client";

import { clsx } from "clsx";
import { Group } from "react-resizable-panels";
import { TerminalComponent } from "./Terminal";
import { Plus, Loader2 } from "lucide-react";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { TabBar } from "./TabBar";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { SplitPane } from "./SplitPane";
import { GridLayout } from "./GridLayout";
import { type GridLayoutMode } from "@/lib/constants/terminal";
import { getProjectSessionId } from "@/lib/utils/session";
import { useTerminalTabsState } from "@/lib/hooks/use-terminal-tabs-state";

interface TerminalTabsProps {
  projectId?: string;
  projectPath?: string;
  className?: string;
}

export function TerminalTabs({ projectId, projectPath, className }: TerminalTabsProps) {
  const {
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
    availableLayouts,
    isGridMode,
    splitPaneCount,

    // Terminal slots
    terminalSlots,
    orderedIds,
    reorder,

    // Terminal refs and statuses
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
    editingId,
    editValue,
    setEditValue,
    editInputRef,
    startEdit,
    saveEdit,
    handleKeyDown: handleEditKeyDown,

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
  } = useTerminalTabsState({ projectId, projectPath });

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
      {/* Tab bar */}
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
        availableLayouts={availableLayouts}
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

      {/* Terminal panels */}
      <div className={clsx(
        "flex-1 min-h-0 relative overflow-hidden",
        isMobile ? "order-1" : "order-2"
      )}>
        {sessions.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--term-text-muted)" }}
          >
            Click <Plus className="w-4 h-4 mx-1 inline" /> to start a terminal
          </div>
        ) : layoutMode === "single" ? (
          sessions.map((session) => {
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
                  ref={(handle) => setTerminalRef(session.id, handle)}
                  sessionId={session.id}
                  workingDir={session.working_dir || projectPath}
                  className="h-full"
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  onStatusChange={(status) => handleStatusChange(session.id, status)}
                />
                {showClaudeOverlay && <ClaudeLoadingOverlay variant="normal" />}
              </div>
            );
          })
        ) : isGridMode ? (
          <GridLayout
            layoutMode={layoutMode as GridLayoutMode}
            slots={terminalSlots}
            orderedSlotIds={orderedIds}
            onReorder={reorder}
            fontFamily={fontFamily}
            fontSize={fontSize}
            onTerminalRef={setTerminalRef}
            onStatusChange={handleStatusChange}
            onModeChange={(projectId, mode, shellId, claudeId, rootPath) =>
              handleProjectModeChange(projectId, mode, shellId, claudeId, rootPath)
            }
          />
        ) : (
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
                  onTerminalRef={setTerminalRef}
                  onStatusChange={handleStatusChange}
                  onModeChange={(projectId, mode, shellId, claudeId, rootPath) =>
                    handleProjectModeChange(projectId, mode, shellId, claudeId, rootPath)
                  }
                />
              );
            })}
          </Group>
        )}
      </div>

      {/* Mobile keyboard */}
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

"use client";

import { useCallback } from "react";
import { clsx } from "clsx";
import { Group } from "react-resizable-panels";
import { TerminalComponent } from "./Terminal";
import { Plus, Loader2 } from "lucide-react";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { TerminalSwitcher } from "./TerminalSwitcher";
import { SettingsDropdown } from "./SettingsDropdown";
import { GlobalActionMenu } from "./GlobalActionMenu";
import { LayoutModeButtons } from "./LayoutModeButton";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { SplitPane } from "./SplitPane";
import { GridLayout } from "./GridLayout";
import { type GridLayoutMode } from "@/lib/constants/terminal";
import { useTerminalTabsState } from "@/lib/hooks/use-terminal-tabs-state";
import { type TerminalSlot } from "@/lib/utils/slot";

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
    resetAll,
  } = useTerminalTabsState({ projectId, projectPath });

  // Compute active slot for unified header in single mode
  // Helper function to find active slot - React Compiler handles memoization
  const getActiveSlot = (): TerminalSlot | null => {
    if (!activeSessionId) return null;

    // Check if active session belongs to a project
    for (const pt of projectTerminals) {
      // Check if active session is one of this project's sessions
      const projectSession = pt.sessions.find((ps) => ps.session.id === activeSessionId);
      if (projectSession) {
        return {
          type: "project",
          projectId: pt.projectId,
          projectName: pt.projectName,
          rootPath: pt.rootPath,
          activeMode: pt.activeMode,
          activeSessionId: projectSession.session.id,
          sessionBadge: projectSession.badge,
          claudeState: projectSession.session.claude_state,
        };
      }
    }

    // Check ad-hoc sessions
    const adHoc = adHocSessions.find((s) => s.id === activeSessionId);
    if (adHoc) {
      return {
        type: "adhoc",
        sessionId: adHoc.id,
        name: adHoc.name,
        workingDir: adHoc.working_dir,
      };
    }

    return null;
  };
  const activeSlot = getActiveSlot();

  // Handler for project selection from switcher
  const handleSelectProject = useCallback((pId: string) => {
    const pt = projectTerminals.find((p) => p.projectId === pId);
    if (pt) {
      handleProjectTabClick(pt);
    }
  }, [projectTerminals, handleProjectTabClick]);

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
      {/* Single mode: Unified header with switcher, layout, and actions */}
      {layoutMode === "single" && (
        <div
          className={clsx(
            "flex-shrink-0 flex items-center gap-1",
            isMobile ? "h-9 px-1.5 order-2" : "h-8 px-2 order-1"
          )}
          style={{
            backgroundColor: "var(--term-bg-surface)",
            borderBottom: "1px solid var(--term-border)",
          }}
        >
          {/* Terminal switcher dropdown */}
          <TerminalSwitcher
            currentName={activeSlot ? (activeSlot.type === "project" ? activeSlot.projectName : activeSlot.name) : "Terminal"}
            currentMode={activeSlot?.type === "project" ? activeSlot.activeMode : undefined}
            projectTerminals={projectTerminals}
            adHocSessions={adHocSessions}
            onSelectProject={handleSelectProject}
            onSelectAdHoc={switchToSession}
            onNewTerminal={() => setShowTerminalManager(true)}
            isMobile={isMobile}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Layout mode buttons - desktop only */}
          {!isMobile && (
            <div className="flex items-center gap-0.5 mr-1">
              <LayoutModeButtons
                layoutMode={layoutMode}
                onLayoutChange={handleLayoutModeChange}
                availableLayouts={availableLayouts}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-0.5">
            {/* Global actions menu */}
            <GlobalActionMenu
              onResetAll={resetAll}
              onCloseAll={handleCloseAll}
              isMobile={isMobile}
            />

            {/* Settings dropdown */}
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
          </div>
        </div>
      )}

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
                  "absolute inset-0 overflow-hidden flex flex-col",
                  session.id === activeSessionId ? "z-10 visible" : "z-0 invisible"
                )}
              >
                <TerminalComponent
                  ref={(handle) => setTerminalRef(session.id, handle)}
                  sessionId={session.id}
                  workingDir={session.working_dir || projectPath}
                  className="flex-1"
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  isVisible={session.id === activeSessionId}
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

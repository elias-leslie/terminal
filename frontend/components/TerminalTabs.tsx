"use client";

import { useState, useCallback } from "react";
import { clsx } from "clsx";
import { Group } from "react-resizable-panels";
import { Plus, Loader2 } from "lucide-react";
import { SingleModeTerminals } from "./SingleModeTerminals";
import { FileUploadDropzone } from "./FileUploadDropzone";
import { PromptCleaner } from "./PromptCleaner";
import { TerminalHeader } from "./TerminalHeader";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { SplitPane } from "./SplitPane";
import { GridLayout } from "./GridLayout";
import { SessionTabBar } from "./SessionTabBar";
import { type GridLayoutMode } from "@/lib/constants/terminal";
import { useTerminalTabsState } from "@/lib/hooks/use-terminal-tabs-state";
import { usePromptCleaner } from "@/lib/hooks/use-prompt-cleaner";
import { useTerminalSlotHandlers } from "@/lib/hooks/use-terminal-slot-handlers";
import { useTerminalActionHandlers } from "@/lib/hooks/use-terminal-action-handlers";
import { type TerminalSlot } from "@/lib/utils/slot";

interface TerminalTabsProps {
  projectId?: string;
  projectPath?: string;
  className?: string;
}

export function TerminalTabs({
  projectId,
  projectPath,
  className,
}: TerminalTabsProps) {
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
    terminalRefs,
    setTerminalRef,

    // Settings
    fontId,
    fontSize,
    fontFamily,
    scrollback,
    cursorStyle,
    cursorBlink,
    themeId,
    theme,
    setFontId,
    setFontSize,
    setScrollback,
    setCursorStyle,
    setCursorBlink,
    setThemeId,
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
    handleNewTerminalForProject,
    handleProjectTabClick,
    handleCloseAll,

    // Project operations
    resetAll,
    resetProject,
    disableProject,
    reset,
    remove,
  } = useTerminalTabsState({ projectId, projectPath });

  // Compute active slot for unified header in single mode
  // Helper function to find active slot - React Compiler handles memoization
  const getActiveSlot = (): TerminalSlot | null => {
    if (!activeSessionId) return null;

    // Check if active session belongs to a project
    for (const pt of projectTerminals) {
      // Check if active session is one of this project's sessions
      const projectSession = pt.sessions.find(
        (ps) => ps.session.id === activeSessionId,
      );
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
  const handleSelectProject = useCallback(
    (pId: string) => {
      const pt = projectTerminals.find((p) => p.projectId === pId);
      if (pt) {
        handleProjectTabClick(pt);
      }
    },
    [projectTerminals, handleProjectTabClick],
  );

  // Prompt cleaner state
  const [showCleaner, setShowCleaner] = useState(false);
  const [cleanerRawPrompt, setCleanerRawPrompt] = useState("");

  // Slot-based handlers for grid/split mode headers
  const {
    handleSlotSwitch,
    handleSlotReset,
    handleSlotClose,
    handleSlotClean,
    handleSlotNewShell,
    handleSlotNewClaude,
  } = useTerminalSlotHandlers({
    terminalRefs,
    switchToSession,
    resetProject,
    reset,
    disableProject,
    remove,
    handleNewTerminalForProject,
    setShowCleaner,
    setCleanerRawPrompt,
  });

  // File upload and prompt cleaner functionality
  const { cleanPrompt, isLoading: isCleanerLoading } = usePromptCleaner();
  const {
    fileInputRef,
    progress,
    isUploading,
    uploadError,
    handleUploadClick,
    handleFileSelect,
    handleFileInputChange,
    handleCleanClick,
    handleCleanerSend,
    handleCleanerCancel,
  } = useTerminalActionHandlers({
    terminalRefs,
    activeSessionId,
    showCleaner,
    setShowCleaner,
    setCleanerRawPrompt,
  });

  // Loading state
  if (isLoading) {
    return (
      <div
        className={clsx(
          "flex flex-col h-full items-center justify-center",
          className,
        )}
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: "var(--term-accent)" }}
        />
        <span
          className="mt-2 text-sm"
          style={{ color: "var(--term-text-muted)" }}
        >
          Loading terminals...
        </span>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        "flex flex-col h-full min-h-0 overflow-visible",
        className,
      )}
    >
      {/* Single mode: Unified header with switcher, layout, and actions */}
      {layoutMode === "single" && (
        <TerminalHeader
          activeSlot={activeSlot}
          projectTerminals={projectTerminals}
          adHocSessions={adHocSessions}
          layoutMode={layoutMode}
          availableLayouts={availableLayouts}
          isMobile={isMobile}
          isCleanerLoading={isCleanerLoading}
          isUploading={isUploading}
          fontId={fontId}
          fontSize={fontSize}
          scrollback={scrollback}
          cursorStyle={cursorStyle}
          cursorBlink={cursorBlink}
          themeId={themeId}
          showSettings={showSettings}
          keyboardSize={keyboardSize}
          onSelectProject={handleSelectProject}
          onSelectAdHoc={switchToSession}
          onNewTerminal={() => setShowTerminalManager(true)}
          onNewTerminalForProject={handleNewTerminalForProject}
          onLayoutChange={handleLayoutModeChange}
          onCleanClick={handleCleanClick}
          onUploadClick={handleUploadClick}
          onResetAll={resetAll}
          onCloseAll={handleCloseAll}
          setFontId={setFontId}
          setFontSize={setFontSize}
          setScrollback={setScrollback}
          setCursorStyle={setCursorStyle}
          setCursorBlink={setCursorBlink}
          setThemeId={setThemeId}
          setShowSettings={setShowSettings}
          setKeyboardSize={handleKeyboardSizeChange}
        />
      )}

      {/* Session tab bar - only in single mode, not on mobile */}
      {layoutMode === "single" && !isMobile && terminalSlots.length > 1 && (
        <SessionTabBar
          slots={terminalSlots}
          activeSessionId={activeSessionId}
          orderedSlotIds={orderedIds}
          onReorder={reorder}
          onSelectSlot={handleSlotSwitch}
          onCloseSlot={handleSlotClose}
          onNewTerminal={() => setShowTerminalManager(true)}
        />
      )}

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/*,.md,.txt,.json,.pdf"
      />

      {/* Upload progress indicator */}
      {isUploading && (
        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg"
          style={{
            backgroundColor: "var(--term-bg-elevated)",
            border: "1px solid var(--term-border)",
          }}
        >
          <div className="flex items-center gap-2">
            <Loader2
              className="w-4 h-4 animate-spin"
              style={{ color: "var(--term-accent)" }}
            />
            <span
              className="text-sm"
              style={{ color: "var(--term-text-primary)" }}
            >
              Uploading... {progress}%
            </span>
          </div>
        </div>
      )}

      {/* Upload error indicator */}
      {uploadError && (
        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg"
          style={{
            backgroundColor: "var(--term-bg-elevated)",
            border: "1px solid var(--term-error)",
          }}
        >
          <span className="text-sm" style={{ color: "var(--term-error)" }}>
            {uploadError.message}
          </span>
        </div>
      )}

      {/* Terminal panels with drag-drop upload */}
      <FileUploadDropzone
        onFileSelect={handleFileSelect}
        disabled={isUploading}
        className={clsx(
          "flex-1 min-h-0 relative overflow-hidden",
          isMobile ? "order-1" : "order-2",
        )}
      >
        {sessions.length === 0 ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: "var(--term-text-muted)" }}
          >
            Click <Plus className="w-4 h-4 mx-1 inline" /> to start a terminal
          </div>
        ) : layoutMode === "single" ? (
          <SingleModeTerminals
            sessions={sessions}
            activeSessionId={activeSessionId}
            projectPath={projectPath}
            fontFamily={fontFamily}
            fontSize={fontSize}
            scrollback={scrollback}
            cursorStyle={cursorStyle}
            cursorBlink={cursorBlink}
            theme={theme}
            onTerminalRef={setTerminalRef}
            onStatusChange={handleStatusChange}
          />
        ) : isGridMode ? (
          <GridLayout
            layoutMode={layoutMode as GridLayoutMode}
            availableLayouts={availableLayouts}
            onLayout={handleLayoutModeChange}
            slots={terminalSlots}
            orderedSlotIds={orderedIds}
            onReorder={reorder}
            fontFamily={fontFamily}
            fontSize={fontSize}
            scrollback={scrollback}
            cursorStyle={cursorStyle}
            cursorBlink={cursorBlink}
            theme={theme}
            onTerminalRef={setTerminalRef}
            onStatusChange={handleStatusChange}
            onSwitch={handleSlotSwitch}
            onSettings={() => setShowSettings(true)}
            onReset={handleSlotReset}
            onClose={handleSlotClose}
            onUpload={handleUploadClick}
            onClean={handleSlotClean}
            onNewShell={handleSlotNewShell}
            onNewClaude={handleSlotNewClaude}
            isMobile={isMobile}
          />
        ) : (
          <Group
            orientation={
              layoutMode === "horizontal" ? "vertical" : "horizontal"
            }
            className="h-full"
          >
            {terminalSlots.slice(0, splitPaneCount).map((slot, index) => {
              const key =
                slot.type === "project"
                  ? `project-${slot.projectId}`
                  : `adhoc-${slot.sessionId}`;
              return (
                <SplitPane
                  key={key}
                  slot={slot}
                  layoutMode={layoutMode}
                  availableLayouts={availableLayouts}
                  onLayout={handleLayoutModeChange}
                  isLast={index === splitPaneCount - 1}
                  paneCount={splitPaneCount}
                  fontFamily={fontFamily}
                  fontSize={fontSize}
                  scrollback={scrollback}
                  cursorStyle={cursorStyle}
                  cursorBlink={cursorBlink}
                  theme={theme}
                  onTerminalRef={setTerminalRef}
                  onStatusChange={handleStatusChange}
                  onSwitch={handleSlotSwitch}
                  onSettings={() => setShowSettings(true)}
                  onReset={handleSlotReset}
                  onClose={handleSlotClose}
                  onUpload={handleUploadClick}
                  onClean={handleSlotClean}
                  onNewShell={handleSlotNewShell}
                  onNewClaude={handleSlotNewClaude}
                  isMobile={isMobile}
                />
              );
            })}
          </Group>
        )}
      </FileUploadDropzone>

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

      {/* Prompt Cleaner Panel */}
      {showCleaner && (
        <PromptCleaner
          rawPrompt={cleanerRawPrompt}
          onSend={handleCleanerSend}
          onCancel={handleCleanerCancel}
          cleanPrompt={cleanPrompt}
          showDiffToggle={true}
        />
      )}
    </div>
  );
}

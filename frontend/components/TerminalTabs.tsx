"use client";

import { useState, useCallback } from "react";
import { clsx } from "clsx";
import { UploadProgressToast, UploadErrorToast } from "./UploadStatusToast";
import { FileUploadDropzone } from "./FileUploadDropzone";
import { PromptCleaner } from "./PromptCleaner";
import { TerminalHeader } from "./TerminalHeader";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { TerminalManagerModal } from "./TerminalManagerModal";
// SessionTabBar removed - all terminal selection via TerminalSwitcher dropdown in pane header
import {
  KeyboardShortcuts,
  useTerminalKeyboardShortcuts,
} from "./KeyboardShortcuts";
import { TerminalSkeleton } from "./TerminalSkeleton";
import { TerminalLayoutRenderer } from "./TerminalLayoutRenderer";
import { useTerminalTabsState } from "@/lib/hooks/use-terminal-tabs-state";
import { usePromptCleaner } from "@/lib/hooks/use-prompt-cleaner";
import { useTerminalSlotHandlers } from "@/lib/hooks/use-terminal-slot-handlers";
import { useTerminalActionHandlers } from "@/lib/hooks/use-terminal-action-handlers";
import { findActiveSlot } from "@/lib/utils/slot";

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
    canAddPane,

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
  const activeSlot = findActiveSlot(
    activeSessionId,
    projectTerminals,
    adHocSessions,
  );

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

  // Memoized modal/settings openers to avoid inline arrow functions
  const handleOpenTerminalManager = useCallback(
    () => setShowTerminalManager(true),
    [setShowTerminalManager],
  );
  const handleCloseTerminalManager = useCallback(
    () => setShowTerminalManager(false),
    [setShowTerminalManager],
  );
  const handleOpenSettings = useCallback(
    () => setShowSettings(true),
    [setShowSettings],
  );

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

  // Keyboard shortcuts
  const { showHelp: showKeyboardHelp, closeHelp: closeKeyboardHelp } =
    useTerminalKeyboardShortcuts({
      onNewTerminal: handleOpenTerminalManager,
      onCloseTab: () => {
        // Close the current active slot if available
        const activeSlot = terminalSlots.find(
          (slot) =>
            (slot.type === "project" &&
              slot.activeSessionId === activeSessionId) ||
            (slot.type === "adhoc" && slot.sessionId === activeSessionId),
        );
        if (activeSlot) {
          handleSlotClose(activeSlot);
        }
      },
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

  // Loading state - show skeleton instead of spinner
  if (isLoading) {
    return (
      <div className={clsx("flex flex-col h-full min-h-0", className)}>
        <TerminalSkeleton />
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

      {/* SessionTabBar removed - all terminal selection via TerminalSwitcher dropdown in pane header */}

      {/* Hidden file input for upload button */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept="image/*,.md,.txt,.json,.pdf"
      />

      {/* Upload status indicators */}
      {isUploading && <UploadProgressToast progress={progress} />}
      {uploadError && <UploadErrorToast message={uploadError.message} />}

      {/* Terminal panels with drag-drop upload */}
      <FileUploadDropzone
        onFileSelect={handleFileSelect}
        disabled={isUploading}
        className={clsx(
          "flex-1 min-h-0 relative overflow-hidden",
          isMobile ? "order-1" : "order-2",
        )}
      >
        <TerminalLayoutRenderer
          sessions={sessions}
          activeSessionId={activeSessionId}
          projectPath={projectPath}
          layoutMode={layoutMode}
          availableLayouts={availableLayouts}
          isGridMode={isGridMode}
          splitPaneCount={splitPaneCount}
          terminalSlots={terminalSlots}
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
          onLayoutChange={handleLayoutModeChange}
          onSlotSwitch={handleSlotSwitch}
          onSlotReset={handleSlotReset}
          onSlotClose={handleSlotClose}
          onSlotClean={handleSlotClean}
          canAddPane={canAddPane()}
          onShowSettings={handleOpenSettings}
          onShowTerminalManager={handleOpenTerminalManager}
          onUploadClick={handleUploadClick}
          isMobile={isMobile}
        />
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
        onClose={handleCloseTerminalManager}
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

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcuts
        isOpen={showKeyboardHelp}
        onClose={closeKeyboardHelp}
      />
    </div>
  );
}

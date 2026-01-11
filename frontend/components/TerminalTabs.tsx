"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { UploadProgressToast, UploadErrorToast } from "./UploadStatusToast";
import { FileUploadDropzone } from "./FileUploadDropzone";
import { PromptCleaner } from "./PromptCleaner";
import { MobileKeyboard } from "./keyboard/MobileKeyboard";
import { TerminalManagerModal } from "./TerminalManagerModal";
import { SettingsDropdown } from "./SettingsDropdown";
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
import { useLayoutPersistence } from "@/lib/hooks/use-layout-persistence";

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

    // Terminal slots
    terminalSlots,
    orderedIds,
    reorder,
    swapPanes,
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
    handleProjectModeChange,
    handleCloseAll,

    // Project operations
    resetAll,
    resetProject,
    disableProject,
    reset,
    remove,
    // Pane operations (new architecture)
    panes,
    removePane,
    createAdHocPane,
    saveLayouts,
  } = useTerminalTabsState({ projectId, projectPath });

  // Note: single mode header removed - all controls now in pane headers

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
    handleSlotModeSwitch,
    isModeSwitching,
  } = useTerminalSlotHandlers({
    terminalRefs,
    switchToSession,
    resetProject,
    reset,
    disableProject,
    remove,
    removePane,
    handleNewTerminalForProject,
    setShowCleaner,
    setCleanerRawPrompt,
    sessions,
    handleProjectModeChange,
  });

  // Layout persistence with debouncing
  const { handleLayoutChange } = useLayoutPersistence({
    saveLayouts,
    debounceMs: 500,
    maxRetries: 3,
  });

  // Auto-create logic is now handled in use-terminal-tabs-state.ts
  // to prevent race conditions between multiple effects

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
      onNextTerminal: () => {
        // Cycle to next terminal in orderedIds
        if (orderedIds.length <= 1) return;
        const currentIndex = orderedIds.findIndex((id) =>
          terminalSlots.some(
            (slot) =>
              (slot.type === "project" &&
                slot.activeSessionId === activeSessionId &&
                `project-${slot.projectId}` === id) ||
              (slot.type === "adhoc" &&
                slot.sessionId === activeSessionId &&
                `adhoc-${slot.sessionId}` === id),
          ),
        );
        const nextIndex = (currentIndex + 1) % orderedIds.length;
        const nextSlot = terminalSlots.find(
          (slot) =>
            (slot.type === "project" &&
              `project-${slot.projectId}` === orderedIds[nextIndex]) ||
            (slot.type === "adhoc" &&
              `adhoc-${slot.sessionId}` === orderedIds[nextIndex]),
        );
        if (nextSlot) handleSlotSwitch(nextSlot);
      },
      onPrevTerminal: () => {
        // Cycle to previous terminal in orderedIds
        if (orderedIds.length <= 1) return;
        const currentIndex = orderedIds.findIndex((id) =>
          terminalSlots.some(
            (slot) =>
              (slot.type === "project" &&
                slot.activeSessionId === activeSessionId &&
                `project-${slot.projectId}` === id) ||
              (slot.type === "adhoc" &&
                slot.sessionId === activeSessionId &&
                `adhoc-${slot.sessionId}` === id),
          ),
        );
        const prevIndex =
          (currentIndex - 1 + orderedIds.length) % orderedIds.length;
        const prevSlot = terminalSlots.find(
          (slot) =>
            (slot.type === "project" &&
              `project-${slot.projectId}` === orderedIds[prevIndex]) ||
            (slot.type === "adhoc" &&
              `adhoc-${slot.sessionId}` === orderedIds[prevIndex]),
        );
        if (prevSlot) handleSlotSwitch(prevSlot);
      },
      onJumpToTerminal: (index) => {
        // Jump to terminal at position (0-indexed)
        if (index >= orderedIds.length) return;
        const targetSlot = terminalSlots.find(
          (slot) =>
            (slot.type === "project" &&
              `project-${slot.projectId}` === orderedIds[index]) ||
            (slot.type === "adhoc" &&
              `adhoc-${slot.sessionId}` === orderedIds[index]),
        );
        if (targetSlot) handleSlotSwitch(targetSlot);
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
      {/* Settings dropdown - all settings controls */}
      <SettingsDropdown
        fontId={fontId}
        fontSize={fontSize}
        scrollback={scrollback}
        cursorStyle={cursorStyle}
        cursorBlink={cursorBlink}
        themeId={themeId}
        setFontId={setFontId}
        setFontSize={setFontSize}
        setScrollback={setScrollback}
        setCursorStyle={setCursorStyle}
        setCursorBlink={setCursorBlink}
        setThemeId={setThemeId}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        keyboardSize={keyboardSize}
        setKeyboardSize={handleKeyboardSizeChange}
        isMobile={isMobile}
        renderTrigger={false}
      />

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
          terminalSlots={terminalSlots}
          fontFamily={fontFamily}
          fontSize={fontSize}
          scrollback={scrollback}
          cursorStyle={cursorStyle}
          cursorBlink={cursorBlink}
          theme={theme}
          onTerminalRef={setTerminalRef}
          onStatusChange={handleStatusChange}
          onSlotSwitch={handleSlotSwitch}
          onSlotReset={handleSlotReset}
          onSlotClose={handleSlotClose}
          onSlotClean={handleSlotClean}
          canAddPane={canAddPane()}
          onShowSettings={handleOpenSettings}
          onShowTerminalManager={handleOpenTerminalManager}
          onUploadClick={handleUploadClick}
          onModeSwitch={handleSlotModeSwitch}
          isModeSwitching={isModeSwitching}
          isMobile={isMobile}
          onSwapPanes={swapPanes}
          onLayoutChange={handleLayoutChange}
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
        onCreateProjectTerminal={(projectId, rootPath) =>
          handleNewTerminalForProject(projectId, "shell", rootPath)
        }
        panes={panes}
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

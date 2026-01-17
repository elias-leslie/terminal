'use client'

import { clsx } from 'clsx'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useLayoutPersistence } from '@/lib/hooks/use-layout-persistence'
import { usePromptCleaner } from '@/lib/hooks/use-prompt-cleaner'
import { useTerminalActionHandlers } from '@/lib/hooks/use-terminal-action-handlers'
import { useTerminalSlotHandlers } from '@/lib/hooks/use-terminal-slot-handlers'
import { useTerminalTabsState } from '@/lib/hooks/use-terminal-tabs-state'
import { FileUploadDropzone } from './FileUploadDropzone'
// SessionTabBar removed - all terminal selection via TerminalSwitcher dropdown in pane header
import {
  KeyboardShortcuts,
  useTerminalKeyboardShortcuts,
} from './KeyboardShortcuts'
import { MobileKeyboard } from './keyboard/MobileKeyboard'
import { PromptCleaner } from './PromptCleaner'
import { SettingsDropdown } from './SettingsDropdown'
import { TerminalLayoutRenderer } from './TerminalLayoutRenderer'
import { TerminalManagerModal } from './TerminalManagerModal'
import { TerminalSkeleton } from './TerminalSkeleton'
import { UploadErrorToast, UploadProgressToast } from './UploadStatusToast'

interface TerminalTabsProps {
  projectId?: string
  projectPath?: string
  className?: string
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
    adHocSessions: _adHocSessions,
    isLoading,

    // Layout state
    layoutMode: _layoutMode,
    availableLayouts: _availableLayouts,
    isGridMode: _isGridMode,

    // Terminal slots
    terminalSlots,
    orderedIds,
    reorder: _reorder,
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
    handleLayoutModeChange: _handleLayoutModeChange,
    handleAddTab,
    handleNewTerminalForProject,
    handleProjectTabClick,
    handleProjectModeChange,
    handleCloseAll: _handleCloseAll,

    // Project operations
    resetAll: _resetAll,
    resetProject,
    disableProject,
    reset,
    remove,
    // Pane operations (new architecture)
    panes,
    removePane,
    createAdHocPane: _createAdHocPane,
    saveLayouts,
  } = useTerminalTabsState({ projectId, projectPath })

  // URL param handling for modals
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const urlModal = searchParams.get('modal')

  // Helper to update URL params
  const updateUrlParams = useCallback(
    (updates: Record<string, string | null>) => {
      const newParams = new URLSearchParams(searchParams.toString())
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          newParams.delete(key)
        } else {
          newParams.set(key, value)
        }
      }
      const query = newParams.toString()
      router.replace(`${pathname}${query ? `?${query}` : ''}`, {
        scroll: false,
      })
    },
    [searchParams, router, pathname],
  )

  // Sync modal state from URL params (keyboard shortcuts handled after hook is defined)

  // Note: single mode header removed - all controls now in pane headers

  // Handler for project selection from switcher
  const _handleSelectProject = useCallback(
    (pId: string) => {
      const pt = projectTerminals.find((p) => p.projectId === pId)
      if (pt) {
        handleProjectTabClick(pt)
      }
    },
    [projectTerminals, handleProjectTabClick],
  )

  // Prompt cleaner state
  const [showCleaner, setShowCleaner] = useState(false)
  const [cleanerRawPrompt, setCleanerRawPrompt] = useState('')

  // Memoized modal/settings openers to avoid inline arrow functions
  // With URL param support for modals
  const handleOpenTerminalManager = useCallback(() => {
    setShowTerminalManager(true)
    updateUrlParams({ modal: 'terminal-manager' })
  }, [setShowTerminalManager, updateUrlParams])

  const handleCloseTerminalManager = useCallback(() => {
    setShowTerminalManager(false)
    updateUrlParams({ modal: null })
  }, [setShowTerminalManager, updateUrlParams])

  const handleOpenSettings = useCallback(
    () => setShowSettings(true),
    [setShowSettings],
  )

  // Slot-based handlers for grid/split mode headers
  const {
    handleSlotSwitch,
    handleSlotReset,
    handleSlotClose,
    handleSlotClean,
    handleSlotNewShell: _handleSlotNewShell,
    handleSlotNewClaude: _handleSlotNewClaude,
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
  })

  // Layout persistence with debouncing
  const { handleLayoutChange } = useLayoutPersistence({
    saveLayouts,
    debounceMs: 500,
    maxRetries: 3,
  })

  // Auto-create logic is now handled in use-terminal-tabs-state.ts
  // to prevent race conditions between multiple effects

  // Keyboard shortcuts
  const { showHelp: showKeyboardHelp, setShowHelp: setShowKeyboardHelp } =
    useTerminalKeyboardShortcuts({
      onNewTerminal: handleOpenTerminalManager,
      onCloseTab: () => {
        // Close the current active slot if available
        const activeSlot = terminalSlots.find(
          (slot) =>
            (slot.type === 'project' &&
              slot.activeSessionId === activeSessionId) ||
            (slot.type === 'adhoc' && slot.sessionId === activeSessionId),
        )
        if (activeSlot) {
          handleSlotClose(activeSlot)
        }
      },
      onNextTerminal: () => {
        // Cycle to next terminal in orderedIds
        if (orderedIds.length <= 1) return
        const currentIndex = orderedIds.findIndex((id) =>
          terminalSlots.some(
            (slot) =>
              (slot.type === 'project' &&
                slot.activeSessionId === activeSessionId &&
                `project-${slot.projectId}` === id) ||
              (slot.type === 'adhoc' &&
                slot.sessionId === activeSessionId &&
                `adhoc-${slot.sessionId}` === id),
          ),
        )
        const nextIndex = (currentIndex + 1) % orderedIds.length
        const nextSlot = terminalSlots.find(
          (slot) =>
            (slot.type === 'project' &&
              `project-${slot.projectId}` === orderedIds[nextIndex]) ||
            (slot.type === 'adhoc' &&
              `adhoc-${slot.sessionId}` === orderedIds[nextIndex]),
        )
        if (nextSlot) handleSlotSwitch(nextSlot)
      },
      onPrevTerminal: () => {
        // Cycle to previous terminal in orderedIds
        if (orderedIds.length <= 1) return
        const currentIndex = orderedIds.findIndex((id) =>
          terminalSlots.some(
            (slot) =>
              (slot.type === 'project' &&
                slot.activeSessionId === activeSessionId &&
                `project-${slot.projectId}` === id) ||
              (slot.type === 'adhoc' &&
                slot.sessionId === activeSessionId &&
                `adhoc-${slot.sessionId}` === id),
          ),
        )
        const prevIndex =
          (currentIndex - 1 + orderedIds.length) % orderedIds.length
        const prevSlot = terminalSlots.find(
          (slot) =>
            (slot.type === 'project' &&
              `project-${slot.projectId}` === orderedIds[prevIndex]) ||
            (slot.type === 'adhoc' &&
              `adhoc-${slot.sessionId}` === orderedIds[prevIndex]),
        )
        if (prevSlot) handleSlotSwitch(prevSlot)
      },
      onJumpToTerminal: (index) => {
        // Jump to terminal at position (0-indexed)
        if (index >= orderedIds.length) return
        const targetSlot = terminalSlots.find(
          (slot) =>
            (slot.type === 'project' &&
              `project-${slot.projectId}` === orderedIds[index]) ||
            (slot.type === 'adhoc' &&
              `adhoc-${slot.sessionId}` === orderedIds[index]),
        )
        if (targetSlot) handleSlotSwitch(targetSlot)
      },
    })

  // Sync modal state from URL params
  useEffect(() => {
    if (urlModal === 'terminal-manager') {
      setShowTerminalManager(true)
    } else if (urlModal === 'keyboard-shortcuts') {
      setShowKeyboardHelp(true)
    }
  }, [urlModal, setShowTerminalManager, setShowKeyboardHelp])

  // Close keyboard shortcuts handler with URL param update
  const closeKeyboardHelp = useCallback(() => {
    setShowKeyboardHelp(false)
    updateUrlParams({ modal: null })
  }, [setShowKeyboardHelp, updateUrlParams])

  // File upload and prompt cleaner functionality
  const { cleanPrompt, isLoading: _isCleanerLoading } = usePromptCleaner()
  const {
    fileInputRef,
    progress,
    isUploading,
    uploadError,
    handleUploadClick,
    handleFileSelect,
    handleFileInputChange,
    handleCleanClick: _handleCleanClick,
    handleCleanerSend,
    handleCleanerCancel,
  } = useTerminalActionHandlers({
    terminalRefs,
    activeSessionId,
    showCleaner,
    setShowCleaner,
    setCleanerRawPrompt,
  })

  // Loading state - show skeleton instead of spinner
  if (isLoading) {
    return (
      <div className={clsx('flex flex-col h-full min-h-0', className)}>
        <TerminalSkeleton />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'flex flex-col h-full min-h-0 overflow-visible',
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
          'flex-1 min-h-0 relative overflow-hidden',
          isMobile ? 'order-1' : 'order-2',
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
          handleNewTerminalForProject(projectId, 'shell', rootPath)
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
  )
}

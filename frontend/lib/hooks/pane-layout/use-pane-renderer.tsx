import { useCallback } from 'react'
import type { PaneSlot, TerminalSlot } from '@/lib/utils/slot'
import {
  getSlotSessionId,
  getSlotWorkingDir,
  getSlotPanelId,
} from '@/lib/utils/slot'
import { TerminalComponent } from '@/components/Terminal'
import { UnifiedTerminalHeader } from '@/components/UnifiedTerminalHeader'
import type { ResizablePaneLayoutProps } from '@/types/pane-layout'

interface UsePaneRendererOptions {
  props: Pick<
    ResizablePaneLayoutProps,
    | 'onSwitch'
    | 'onSettings'
    | 'onReset'
    | 'onClose'
    | 'onUpload'
    | 'onClean'
    | 'onOpenModal'
    | 'canAddPane'
    | 'onModeSwitch'
    | 'isModeSwitching'
    | 'isMobile'
    | 'onSwapPanes'
    | 'onTerminalRef'
    | 'fontFamily'
    | 'fontSize'
    | 'scrollback'
    | 'cursorStyle'
    | 'cursorBlink'
    | 'theme'
    | 'onStatusChange'
  >
  displaySlots: (TerminalSlot | PaneSlot)[]
  paneCount: number
}

/**
 * Hook to create the renderPane function for individual pane rendering.
 */
export function usePaneRenderer({
  props,
  displaySlots,
  paneCount,
}: UsePaneRendererOptions) {
  const {
    onSwitch,
    onSettings,
    onReset,
    onClose,
    onUpload,
    onClean,
    onOpenModal,
    canAddPane,
    onModeSwitch,
    isModeSwitching,
    isMobile,
    onSwapPanes,
    onTerminalRef,
    fontFamily,
    fontSize,
    scrollback,
    cursorStyle,
    cursorBlink,
    theme,
    onStatusChange,
  } = props

  const renderPane = useCallback(
    (slot: TerminalSlot | PaneSlot, _index: number) => {
      const sessionId = getSlotSessionId(slot)
      const workingDir = getSlotWorkingDir(slot)
      const panelId = getSlotPanelId(slot)

      return (
        <div
          className="flex flex-col h-full min-h-0 overflow-hidden rounded-md"
          style={{
            backgroundColor: 'var(--term-bg-surface)',
            border: '1px solid var(--term-border)',
          }}
        >
          <UnifiedTerminalHeader
            slot={slot}
            showCleanButton={
              slot.type === 'project' && slot.activeMode === 'claude'
            }
            onSwitch={onSwitch ? () => onSwitch(slot) : undefined}
            onSettings={onSettings}
            onReset={onReset ? () => onReset(slot) : undefined}
            onClose={onClose ? () => onClose(slot) : undefined}
            onUpload={onUpload}
            onClean={onClean ? () => onClean(slot) : undefined}
            onOpenModal={onOpenModal}
            canAddPane={canAddPane}
            onModeSwitch={
              onModeSwitch ? (mode) => onModeSwitch(slot, mode) : undefined
            }
            isModeSwitching={isModeSwitching}
            isMobile={isMobile}
            allSlots={paneCount > 1 ? displaySlots : undefined}
            onSwapWith={
              onSwapPanes && paneCount > 1
                ? (otherSlotId) => onSwapPanes(panelId, otherSlotId)
                : undefined
            }
          />

          <div
            className="flex-1 min-h-0 overflow-hidden relative"
            style={{ backgroundColor: 'var(--term-bg-deep)' }}
          >
            {sessionId ? (
              <TerminalComponent
                ref={(handle) => onTerminalRef?.(sessionId, handle)}
                sessionId={sessionId}
                workingDir={workingDir || undefined}
                className="h-full"
                fontFamily={fontFamily}
                fontSize={fontSize}
                scrollback={scrollback}
                cursorStyle={cursorStyle}
                cursorBlink={cursorBlink}
                theme={theme}
                onStatusChange={(status) => onStatusChange?.(sessionId, status)}
              />
            ) : (
              <div
                className="flex items-center justify-center h-full text-xs"
                style={{ color: 'var(--term-text-muted)' }}
              >
                Click tab to start session
              </div>
            )}
          </div>
        </div>
      )
    },
    [
      onSwitch,
      onSettings,
      onReset,
      onClose,
      onUpload,
      onClean,
      onOpenModal,
      canAddPane,
      onModeSwitch,
      isModeSwitching,
      isMobile,
      displaySlots,
      paneCount,
      onSwapPanes,
      onTerminalRef,
      fontFamily,
      fontSize,
      scrollback,
      cursorStyle,
      cursorBlink,
      theme,
      onStatusChange,
    ],
  )

  return renderPane
}

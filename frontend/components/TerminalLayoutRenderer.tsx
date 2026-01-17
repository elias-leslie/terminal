'use client'

import type { PaneSlot, TerminalSlot } from '@/lib/utils/slot'
import type { TerminalMode } from './ModeToggle'
import { type PaneLayout, ResizablePaneLayout } from './ResizablePaneLayout'
import type { TerminalComponent, TerminalHandle } from './Terminal'
import type { ConnectionStatus } from './terminal.types'

interface TerminalLayoutRendererProps {
  // Slots (pane-based architecture)
  terminalSlots: (TerminalSlot | PaneSlot)[]

  // Terminal settings
  fontFamily: string
  fontSize: number
  scrollback: number
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  theme?: Parameters<typeof TerminalComponent>[0]['theme']

  // Terminal ref and status handlers
  onTerminalRef: (sessionId: string, handle: TerminalHandle | null) => void
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void

  // Slot action handlers
  onSlotSwitch: (slot: TerminalSlot | PaneSlot) => void
  onSlotReset: (slot: TerminalSlot | PaneSlot) => void
  onSlotClose: (slot: TerminalSlot | PaneSlot) => void
  onSlotClean: (slot: TerminalSlot | PaneSlot) => void

  // Pane limits
  canAddPane: boolean

  // UI callbacks
  onShowSettings: () => void
  onShowTerminalManager: () => void
  onUploadClick: () => void

  // Mode switch handler for project slots
  onModeSwitch?: (
    slot: TerminalSlot | PaneSlot,
    mode: TerminalMode,
  ) => void | Promise<void>
  isModeSwitching?: boolean

  // Device
  isMobile: boolean

  // Pane swap (for dropdown swap)
  onSwapPanes?: (slotIdA: string, slotIdB: string) => void

  // Layout persistence
  onLayoutChange?: (layouts: PaneLayout[]) => void
  initialLayouts?: PaneLayout[]
}

export function TerminalLayoutRenderer({
  terminalSlots,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  theme,
  onTerminalRef,
  onStatusChange,
  onSlotSwitch,
  onSlotReset,
  onSlotClose,
  onSlotClean,
  canAddPane,
  onShowSettings,
  onShowTerminalManager,
  onUploadClick,
  onModeSwitch,
  isModeSwitching,
  isMobile,
  onSwapPanes,
  onLayoutChange,
  initialLayouts,
}: TerminalLayoutRendererProps) {
  return (
    <ResizablePaneLayout
      slots={terminalSlots}
      fontFamily={fontFamily}
      fontSize={fontSize}
      scrollback={scrollback}
      cursorStyle={cursorStyle}
      cursorBlink={cursorBlink}
      theme={theme}
      onTerminalRef={onTerminalRef}
      onStatusChange={onStatusChange}
      onSwitch={onSlotSwitch}
      onSettings={onShowSettings}
      onReset={onSlotReset}
      onClose={onSlotClose}
      onUpload={onUploadClick}
      onClean={onSlotClean}
      onOpenModal={onShowTerminalManager}
      canAddPane={canAddPane}
      onModeSwitch={onModeSwitch}
      isModeSwitching={isModeSwitching}
      isMobile={isMobile}
      onSwapPanes={onSwapPanes}
      onLayoutChange={onLayoutChange}
      initialLayouts={initialLayouts}
    />
  )
}

import type { ConnectionStatus, TerminalHandle } from '@/components/Terminal'
import type { TerminalMode } from '@/components/ModeToggle'
import type { PaneSlot, TerminalSlot } from '@/lib/utils/slot'
import type { TerminalComponent } from '@/components/Terminal'

// Minimum pane size in pixels (400x300 requirement)
export const MIN_PANE_WIDTH_PX = 400
export const MIN_PANE_HEIGHT_PX = 300

// Convert pixel minimum to percentage (approximate for typical viewport)
export const DEFAULT_MIN_SIZE_PERCENT = 20

export interface PaneLayout {
  slotId: string
  widthPercent: number
  heightPercent: number
  row: number
  col: number
}

export interface ResizablePaneLayoutProps {
  slots: (TerminalSlot | PaneSlot)[]
  fontFamily: string
  fontSize: number
  scrollback?: number
  cursorStyle?: 'block' | 'underline' | 'bar'
  cursorBlink?: boolean
  theme?: Parameters<typeof TerminalComponent>[0]['theme']
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void
  onSwitch?: (slot: TerminalSlot | PaneSlot) => void
  onSettings?: () => void
  onReset?: (slot: TerminalSlot | PaneSlot) => void
  onClose?: (slot: TerminalSlot | PaneSlot) => void
  onUpload?: () => void
  onClean?: (slot: TerminalSlot | PaneSlot) => void
  onOpenModal?: () => void
  canAddPane?: boolean
  onModeSwitch?: (
    slot: TerminalSlot | PaneSlot,
    mode: TerminalMode,
  ) => void | Promise<void>
  isModeSwitching?: boolean
  isMobile?: boolean
  onLayoutChange?: (layouts: PaneLayout[]) => void
  initialLayouts?: PaneLayout[]
  onSwapPanes?: (slotIdA: string, slotIdB: string) => void
}

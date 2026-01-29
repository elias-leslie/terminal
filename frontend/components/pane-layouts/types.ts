import type { Layout } from 'react-resizable-panels'
import type { PaneSlot, TerminalSlot } from '@/lib/utils/slot'

export interface LayoutHelperProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  displaySlots: (TerminalSlot | PaneSlot)[]
  getMinSizePercent: (direction: 'horizontal' | 'vertical') => number
  handleLayoutChange: (layout: Layout) => void
  renderPane: (slot: TerminalSlot | PaneSlot, index: number) => React.ReactNode
}

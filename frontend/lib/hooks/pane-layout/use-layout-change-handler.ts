import { useCallback } from 'react'
import type { Layout } from 'react-resizable-panels'
import type { PaneSlot, TerminalSlot } from '@/lib/utils/slot'
import { isPaneSlot, getPaneId, getSlotPanelId } from '@/lib/utils/slot'
import type { PaneLayout } from '@/types/pane-layout'

/**
 * Hook to create the layout change handler.
 */
export function useLayoutChangeHandler(
  displaySlots: (TerminalSlot | PaneSlot)[],
  paneCount: number,
  onLayoutChange?: (layouts: PaneLayout[]) => void,
) {
  const handleLayoutChange = useCallback(
    (layout: Layout) => {
      if (!onLayoutChange) return

      const layouts: PaneLayout[] = displaySlots.map((slot, index) => {
        const panelId = getSlotPanelId(slot)
        const persistenceId = isPaneSlot(slot) ? getPaneId(slot) : panelId
        return {
          slotId: persistenceId,
          widthPercent: layout[panelId] ?? 100 / paneCount,
          heightPercent: 100,
          row: 0,
          col: index,
        }
      })

      onLayoutChange(layouts)
    },
    [displaySlots, onLayoutChange, paneCount],
  )

  return handleLayoutChange
}

'use client'

import { useCallback } from 'react'
import { Separator, type GroupImperativeHandle } from 'react-resizable-panels'

interface ResizeSeparatorProps {
  orientation: 'horizontal' | 'vertical'
  groupRef: React.RefObject<GroupImperativeHandle | null>
  adjacentPanelIds: [string, string]
}

/**
 * Custom separator with double-click to reset adjacent panels to equal sizes.
 */
export function ResizeSeparator({
  orientation,
  groupRef,
  adjacentPanelIds,
}: ResizeSeparatorProps) {
  const handleDoubleClick = useCallback(() => {
    const group = groupRef.current
    if (!group) return

    const currentLayout = group.getLayout()
    const [panelA, panelB] = adjacentPanelIds
    const totalSize =
      (currentLayout[panelA] ?? 50) + (currentLayout[panelB] ?? 50)
    const equalSize = totalSize / 2

    const newLayout = {
      ...currentLayout,
      [panelA]: equalSize,
      [panelB]: equalSize,
    }

    group.setLayout(newLayout)
  }, [groupRef, adjacentPanelIds])

  return (
    <Separator
      className={
        orientation === 'horizontal'
          ? 'resizable-handle-horizontal'
          : 'resizable-handle-vertical'
      }
      onDoubleClick={handleDoubleClick}
    />
  )
}

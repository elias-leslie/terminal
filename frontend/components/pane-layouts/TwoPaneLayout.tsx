'use client'

import { Group, Panel, useGroupRef } from 'react-resizable-panels'
import { getSlotPanelId } from '@/lib/utils/slot'
import { ResizeSeparator } from './ResizeSeparator'
import type { LayoutHelperProps } from './types'

/**
 * Two-pane horizontal layout with double-click reset.
 */
export function TwoPaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const groupRef = useGroupRef()
  const panelIds: [string, string] = [
    getSlotPanelId(displaySlots[0]),
    getSlotPanelId(displaySlots[1]),
  ]

  return (
    <div
      ref={containerRef}
      className="w-full h-full p-1"
      style={{ backgroundColor: 'var(--term-bg-deep)' }}
    >
      <Group
        orientation="horizontal"
        onLayoutChange={handleLayoutChange}
        groupRef={groupRef}
        className="h-full"
      >
        <Panel
          id={panelIds[0]}
          minSize={`${getMinSizePercent('horizontal')}%`}
          defaultSize="50%"
          className="h-full"
        >
          {renderPane(displaySlots[0], 0)}
        </Panel>

        <ResizeSeparator
          orientation="horizontal"
          groupRef={groupRef}
          adjacentPanelIds={panelIds}
        />

        <Panel
          id={panelIds[1]}
          minSize={`${getMinSizePercent('horizontal')}%`}
          defaultSize="50%"
          className="h-full"
        >
          {renderPane(displaySlots[1], 1)}
        </Panel>
      </Group>
    </div>
  )
}

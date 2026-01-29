'use client'

import { Group, Panel, useGroupRef } from 'react-resizable-panels'
import { getSlotPanelId } from '@/lib/utils/slot'
import { ResizeSeparator } from './ResizeSeparator'
import type { LayoutHelperProps } from './types'

/**
 * Three-pane 2+1 layout with double-click reset.
 */
export function ThreePaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const verticalGroupRef = useGroupRef()
  const horizontalGroupRef = useGroupRef()

  const topRowPanelIds: [string, string] = [
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
        orientation="vertical"
        groupRef={verticalGroupRef}
        className="h-full"
      >
        <Panel
          id="top-row"
          minSize={`${getMinSizePercent('vertical')}%`}
          defaultSize="50%"
        >
          <Group
            orientation="horizontal"
            onLayoutChange={handleLayoutChange}
            groupRef={horizontalGroupRef}
            className="h-full"
          >
            <Panel
              id={topRowPanelIds[0]}
              minSize={`${getMinSizePercent('horizontal')}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[0], 0)}
            </Panel>

            <ResizeSeparator
              orientation="horizontal"
              groupRef={horizontalGroupRef}
              adjacentPanelIds={topRowPanelIds}
            />

            <Panel
              id={topRowPanelIds[1]}
              minSize={`${getMinSizePercent('horizontal')}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[1], 1)}
            </Panel>
          </Group>
        </Panel>

        <ResizeSeparator
          orientation="vertical"
          groupRef={verticalGroupRef}
          adjacentPanelIds={['top-row', getSlotPanelId(displaySlots[2])]}
        />

        <Panel
          id={getSlotPanelId(displaySlots[2])}
          minSize={`${getMinSizePercent('vertical')}%`}
          defaultSize="50%"
        >
          {renderPane(displaySlots[2], 2)}
        </Panel>
      </Group>
    </div>
  )
}

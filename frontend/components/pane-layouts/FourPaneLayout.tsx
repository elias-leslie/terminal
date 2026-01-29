'use client'

import { Group, Panel, useGroupRef } from 'react-resizable-panels'
import { getSlotPanelId } from '@/lib/utils/slot'
import { ResizeSeparator } from './ResizeSeparator'
import type { LayoutHelperProps } from './types'

/**
 * Four-pane 2x2 layout with double-click reset.
 */
export function FourPaneLayout({
  containerRef,
  displaySlots,
  getMinSizePercent,
  handleLayoutChange,
  renderPane,
}: LayoutHelperProps) {
  const verticalGroupRef = useGroupRef()
  const topRowGroupRef = useGroupRef()
  const bottomRowGroupRef = useGroupRef()

  const topRowPanelIds: [string, string] = [
    getSlotPanelId(displaySlots[0]),
    getSlotPanelId(displaySlots[1]),
  ]
  const bottomRowPanelIds: [string, string] = [
    getSlotPanelId(displaySlots[2]),
    getSlotPanelId(displaySlots[3]),
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
            groupRef={topRowGroupRef}
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
              groupRef={topRowGroupRef}
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
          adjacentPanelIds={['top-row', 'bottom-row']}
        />

        <Panel
          id="bottom-row"
          minSize={`${getMinSizePercent('vertical')}%`}
          defaultSize="50%"
        >
          <Group
            orientation="horizontal"
            onLayoutChange={handleLayoutChange}
            groupRef={bottomRowGroupRef}
            className="h-full"
          >
            <Panel
              id={bottomRowPanelIds[0]}
              minSize={`${getMinSizePercent('horizontal')}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[2], 2)}
            </Panel>

            <ResizeSeparator
              orientation="horizontal"
              groupRef={bottomRowGroupRef}
              adjacentPanelIds={bottomRowPanelIds}
            />

            <Panel
              id={bottomRowPanelIds[1]}
              minSize={`${getMinSizePercent('horizontal')}%`}
              defaultSize="50%"
              className="h-full"
            >
              {renderPane(displaySlots[3], 3)}
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  )
}

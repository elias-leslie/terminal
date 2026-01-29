'use client'

import { useMemo, useRef } from 'react'
import { MAX_PANES } from '@/lib/constants/terminal'
import type { ResizablePaneLayoutProps } from '@/types/pane-layout'
import {
  useMinSizeCalculator,
  usePaneRenderer,
  useLayoutChangeHandler,
} from '@/lib/hooks/pane-layout'
import {
  EmptyPaneState,
  SinglePaneLayout,
  TwoPaneLayout,
  ThreePaneLayout,
  FourPaneLayout,
} from './pane-layouts'

/**
 * Resizable pane layout using react-resizable-panels.
 * Dynamically adapts grid based on pane count:
 * - 1 pane: full size
 * - 2 panes: vertical split (side by side)
 * - 3 panes: 2+1 layout
 * - 4 panes: 2x2 grid
 */
export function ResizablePaneLayout(props: ResizablePaneLayoutProps) {
  const { slots, onLayoutChange, onOpenModal } = props

  const displaySlots = useMemo(() => slots.slice(0, MAX_PANES), [slots])
  const paneCount = displaySlots.length
  const containerRef = useRef<HTMLDivElement>(null)

  const getMinSizePercent = useMinSizeCalculator(containerRef)
  const handleLayoutChange = useLayoutChangeHandler(
    displaySlots,
    paneCount,
    onLayoutChange,
  )
  const renderPane = usePaneRenderer({ props, displaySlots, paneCount })

  if (paneCount === 0) {
    return (
      <EmptyPaneState containerRef={containerRef} onOpenModal={onOpenModal} />
    )
  }

  if (paneCount === 1) {
    return (
      <SinglePaneLayout
        containerRef={containerRef}
        slot={displaySlots[0]}
        renderPane={renderPane}
      />
    )
  }

  if (paneCount === 2) {
    return (
      <TwoPaneLayout
        containerRef={containerRef}
        displaySlots={displaySlots}
        getMinSizePercent={getMinSizePercent}
        handleLayoutChange={handleLayoutChange}
        renderPane={renderPane}
      />
    )
  }

  if (paneCount === 3) {
    return (
      <ThreePaneLayout
        containerRef={containerRef}
        displaySlots={displaySlots}
        getMinSizePercent={getMinSizePercent}
        handleLayoutChange={handleLayoutChange}
        renderPane={renderPane}
      />
    )
  }

  return (
    <FourPaneLayout
      containerRef={containerRef}
      displaySlots={displaySlots}
      getMinSizePercent={getMinSizePercent}
      handleLayoutChange={handleLayoutChange}
      renderPane={renderPane}
    />
  )
}

export type { ResizablePaneLayoutProps, PaneLayout } from '@/types/pane-layout'

'use client'

import { useCallback, useRef } from 'react'
import type { PaneLayout } from '@/components/ResizablePaneLayout'

interface UseLayoutPersistenceOptions {
  saveLayouts: (
    layouts: Array<{
      paneId: string
      widthPercent?: number
      heightPercent?: number
    }>,
  ) => Promise<unknown>
  debounceMs?: number
  maxRetries?: number
}

/**
 * Hook for persisting pane layouts with debouncing and retry logic.
 *
 * @example
 * ```tsx
 * const { handleLayoutChange } = useLayoutPersistence({
 *   saveLayouts,
 *   debounceMs: 500,
 * });
 *
 * <ResizablePaneLayout onLayoutChange={handleLayoutChange} />
 * ```
 */
export function useLayoutPersistence({
  saveLayouts,
  debounceMs = 500,
  maxRetries = 3,
}: UseLayoutPersistenceOptions) {
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingLayoutsRef = useRef<PaneLayout[] | null>(null)

  const handleLayoutChange = useCallback(
    (layouts: PaneLayout[]) => {
      // Store pending layouts
      pendingLayoutsRef.current = layouts

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }

      // Set new debounced save
      debounceTimerRef.current = setTimeout(async () => {
        const layoutsToSave = pendingLayoutsRef.current
        if (!layoutsToSave || layoutsToSave.length === 0) return

        pendingLayoutsRef.current = null

        // Convert to API format
        const payload = layoutsToSave.map((l) => ({
          paneId: l.slotId,
          widthPercent: l.widthPercent,
          heightPercent: l.heightPercent,
        }))

        // Retry loop
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await saveLayouts(payload)
            return // Success - exit
          } catch (error) {
            if (attempt < maxRetries) {
              console.debug(
                `Layout save failed (attempt ${attempt}/${maxRetries}), retrying...`,
              )
            } else {
              console.error(
                `Failed to save layout after ${maxRetries} attempts:`,
                error,
              )
            }
          }
        }
      }, debounceMs)
    },
    [debounceMs, maxRetries, saveLayouts],
  )

  return {
    handleLayoutChange,
  }
}

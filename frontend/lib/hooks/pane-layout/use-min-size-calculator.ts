import { useCallback } from 'react'
import {
  MIN_PANE_WIDTH_PX,
  MIN_PANE_HEIGHT_PX,
  DEFAULT_MIN_SIZE_PERCENT,
} from '@/types/pane-layout'

/**
 * Hook to calculate minimum pane size percentages based on container dimensions.
 */
export function useMinSizeCalculator(
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const getMinSizePercent = useCallback(
    (direction: 'horizontal' | 'vertical') => {
      if (!containerRef.current) return DEFAULT_MIN_SIZE_PERCENT

      const rect = containerRef.current.getBoundingClientRect()
      if (direction === 'horizontal') {
        const percent = (MIN_PANE_WIDTH_PX / rect.width) * 100
        return Math.max(percent, 10)
      } else {
        const percent = (MIN_PANE_HEIGHT_PX / rect.height) * 100
        return Math.max(percent, 10)
      }
    },
    [],
  )

  return getMinSizePercent
}

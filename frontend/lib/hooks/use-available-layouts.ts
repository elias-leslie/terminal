"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { LayoutMode } from "@/components/LayoutModeButton";
import { GridLayoutMode, GRID_MIN_WIDTHS } from "@/lib/constants/terminal";

/** Grid layout modes (only 2x2 supported - max 4 panes) */
/** Single mode has been removed - grid is the only layout now */
const GRID_LAYOUTS: GridLayoutMode[] = ["grid-2x2"];

/**
 * SSR-safe hook that returns available layout modes based on viewport width.
 * Grid layouts are only available if viewport exceeds their minimum width threshold.
 *
 * @returns Array of available layout modes
 */
export function useAvailableLayouts(): LayoutMode[] {
  // SSR-safe: default to 0 on server, will update after hydration
  const [viewportWidth, setViewportWidth] = useState(0);

  useLayoutEffect(() => {
    // Only run on client
    if (typeof window === "undefined") return;

    // Set initial value - sync with actual browser state after hydration
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: SSR-safe hydration sync
    setViewportWidth(window.innerWidth);

    // Listen for resize events
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return useMemo(() => {
    // Grid layouts only - single mode has been removed
    const available: LayoutMode[] = [];

    // Add grid layouts if viewport is wide enough
    for (const grid of GRID_LAYOUTS) {
      if (viewportWidth >= GRID_MIN_WIDTHS[grid]) {
        available.push(grid);
      }
    }

    // Always have at least grid-2x2 as fallback
    if (available.length === 0) {
      available.push("grid-2x2");
    }

    return available;
  }, [viewportWidth]);
}

/**
 * Helper hook to check if any grid layout is available.
 *
 * @returns true if at least one grid layout mode is available
 */
export function useGridLayoutAvailable(): boolean {
  const availableLayouts = useAvailableLayouts();
  return availableLayouts.some((mode) => mode.startsWith("grid-"));
}

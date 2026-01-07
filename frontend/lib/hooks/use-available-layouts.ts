"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { LayoutMode } from "@/components/LayoutModeButton";
import { GridLayoutMode, GRID_MIN_WIDTHS } from "@/lib/constants/terminal";

/** Base layout modes always available */
const BASE_LAYOUTS: LayoutMode[] = ["single", "horizontal", "vertical"];

/** Grid layout modes in order of increasing size */
const GRID_LAYOUTS: GridLayoutMode[] = ["grid-2x2", "grid-3x3", "grid-4x4"];

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
    // Start with base layouts
    const available: LayoutMode[] = [...BASE_LAYOUTS];

    // Add grid layouts if viewport is wide enough
    for (const grid of GRID_LAYOUTS) {
      if (viewportWidth >= GRID_MIN_WIDTHS[grid]) {
        available.push(grid);
      }
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

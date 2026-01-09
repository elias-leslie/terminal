"use client";

import { useCallback, useEffect, useState } from "react";
import { TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";

interface UseSlotOrderingResult {
  /** Ordered array of panel IDs */
  orderedIds: string[];
  /** Reorder panels to a new order */
  reorder: (newOrder: string[]) => void;
  /** Swap positions of two panels (data swap, persists across layout changes) */
  swapPanes: (slotIdA: string, slotIdB: string) => void;
  /** Reset to default order (order of slots array) */
  resetOrder: () => void;
  /** Check if at maximum pane limit */
  canAddPane: () => boolean;
}

/**
 * Hook to manage ordering of terminal slots for grid layout drag-and-drop.
 * Maintains order across slot additions/removals.
 *
 * @param slots - Array of terminal slots
 * @returns Object with orderedIds array and reorder/reset callbacks
 */
export function useSlotOrdering(slots: TerminalSlot[]): UseSlotOrderingResult {
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  // Sync orderedIds when slots change
  useEffect(() => {
    const currentSlotIds = slots.map(getSlotPanelId);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync external slot changes
    setOrderedIds((prevOrder) => {
      // Keep existing slots in their current order
      const existingInOrder = prevOrder.filter((id) =>
        currentSlotIds.includes(id),
      );

      // Find new slots not in current order
      const newSlots = currentSlotIds.filter((id) => !prevOrder.includes(id));

      // Combine: existing order + new slots at the end
      const newOrder = [...existingInOrder, ...newSlots];

      // CRITICAL: Return same reference if contents unchanged to prevent infinite re-renders
      if (
        newOrder.length === prevOrder.length &&
        newOrder.every((id, i) => prevOrder[i] === id)
      ) {
        return prevOrder;
      }

      return newOrder;
    });
  }, [slots]);

  const reorder = useCallback((newOrder: string[]) => {
    setOrderedIds(newOrder);
  }, []);

  /**
   * Swap positions of two panels.
   * This is a data swap (state mutation), not just visual.
   * The swap persists across layout mode changes.
   */
  const swapPanes = useCallback((slotIdA: string, slotIdB: string) => {
    setOrderedIds((prevOrder) => {
      const indexA = prevOrder.indexOf(slotIdA);
      const indexB = prevOrder.indexOf(slotIdB);

      // If either slot not found, do nothing
      if (indexA === -1 || indexB === -1) return prevOrder;

      // If same slot, do nothing
      if (indexA === indexB) return prevOrder;

      // Create new array with swapped positions
      const newOrder = [...prevOrder];
      newOrder[indexA] = slotIdB;
      newOrder[indexB] = slotIdA;
      return newOrder;
    });
  }, []);

  const resetOrder = useCallback(() => {
    setOrderedIds(slots.map(getSlotPanelId));
  }, [slots]);

  // Maximum 4 panes allowed
  const MAX_PANES = 4;
  const canAddPane = useCallback(() => {
    return orderedIds.length < MAX_PANES;
  }, [orderedIds.length]);

  return {
    orderedIds,
    reorder,
    swapPanes,
    resetOrder,
    canAddPane,
  };
}

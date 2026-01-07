"use client";

import { useCallback, useEffect, useState } from "react";
import { TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";

interface UseSlotOrderingResult {
  /** Ordered array of panel IDs */
  orderedIds: string[];
  /** Reorder panels to a new order */
  reorder: (newOrder: string[]) => void;
  /** Reset to default order (order of slots array) */
  resetOrder: () => void;
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
      const existingInOrder = prevOrder.filter((id) => currentSlotIds.includes(id));

      // Find new slots not in current order
      const newSlots = currentSlotIds.filter((id) => !prevOrder.includes(id));

      // Combine: existing order + new slots at the end
      return [...existingInOrder, ...newSlots];
    });
  }, [slots]);

  const reorder = useCallback((newOrder: string[]) => {
    setOrderedIds(newOrder);
  }, []);

  const resetOrder = useCallback(() => {
    setOrderedIds(slots.map(getSlotPanelId));
  }, [slots]);

  return {
    orderedIds,
    reorder,
    resetOrder,
  };
}

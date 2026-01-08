"use client";

import { useReducer } from "react";

interface State {
  mounted: Set<string>;
  recent: string[];
}

type Action =
  | { type: "activate"; id: string; maxMounted: number }
  | { type: "unmount"; id: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "activate": {
      const { id, maxMounted } = action;

      // If already at front of recent, no change
      if (state.recent[0] === id) {
        return state;
      }

      // Build new recent list: this ID at front, then others
      const newRecent = [id, ...state.recent.filter((i) => i !== id)].slice(
        0,
        maxMounted,
      );

      // Build new mounted set from recent list
      const newMounted = new Set(newRecent);

      return {
        mounted: newMounted,
        recent: newRecent,
      };
    }
    case "unmount": {
      const { id } = action;
      if (!state.mounted.has(id)) return state;

      const newMounted = new Set(state.mounted);
      newMounted.delete(id);

      return {
        ...state,
        mounted: newMounted,
        recent: state.recent.filter((i) => i !== id),
      };
    }
    default:
      return state;
  }
}

const initialState: State = {
  mounted: new Set<string>(),
  recent: [],
};

/**
 * Hook for lazy mounting items based on recent usage.
 *
 * Tracks which items are "mounted" by keeping only the most recently
 * activated items up to maxMounted limit.
 *
 * @param activeId - Currently active item ID
 * @param maxMounted - Maximum number of items to keep mounted
 * @returns Set of mounted item IDs
 */
export function useLazyMount(
  activeId: string | null,
  maxMounted: number,
): Set<string> {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Dispatch activation when activeId changes
  // This happens synchronously during render, which is what we want
  // to avoid the "flash" of unmounted state
  if (activeId && state.recent[0] !== activeId) {
    dispatch({ type: "activate", id: activeId, maxMounted });
  }

  return state.mounted;
}

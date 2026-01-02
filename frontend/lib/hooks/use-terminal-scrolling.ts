"use client";

import { useRef, useCallback, useEffect } from "react";
import {
  SCROLL_THRESHOLD,
  COPY_MODE_TIMEOUT_MS,
  COPY_MODE_EXIT_SCROLL_THRESHOLD,
} from "../constants/terminal";

interface CopyModeState {
  inCopyMode: boolean;
  timeout: ReturnType<typeof setTimeout> | null;
  /** Track consecutive down-scrolls to auto-exit when reaching bottom */
  consecutiveDownScrolls: number;
}

interface UseTerminalScrollingOptions {
  /** WebSocket ref for sending scroll commands */
  wsRef: React.RefObject<WebSocket | null>;
  /** Whether to enable mobile touch scrolling */
  isMobile: boolean;
}

interface ScrollingSetupResult {
  /** Cleanup function for wheel events */
  wheelCleanup: () => void;
  /** Cleanup function for touch events (mobile only) */
  touchCleanup: () => void;
}

interface UseTerminalScrollingReturn {
  /** Copy-mode state ref for external access */
  copyModeStateRef: React.RefObject<CopyModeState>;
  /** Set up scrolling handlers on a container element */
  setupScrolling: (container: HTMLElement) => ScrollingSetupResult;
  /** Reset copy-mode state (call on user input) */
  resetCopyMode: () => void;
}

/**
 * Hook for managing tmux copy-mode scrolling in the terminal.
 *
 * Handles:
 * - Desktop wheel scrolling (enter copy-mode, Ctrl+U/D for scroll)
 * - Mobile touch scrolling (swipe gestures)
 * - Copy-mode timeout tracking (auto-exit after 10s inactivity)
 *
 * @example
 * ```tsx
 * const { setupScrolling, resetCopyMode, copyModeStateRef } = useTerminalScrolling({
 *   wsRef,
 *   isMobile: isMobileDevice(),
 * });
 *
 * // In terminal init effect:
 * const { wheelCleanup, touchCleanup } = setupScrolling(containerRef.current);
 *
 * // On user input:
 * resetCopyMode();
 * ```
 */
export function useTerminalScrolling({
  wsRef,
  isMobile,
}: UseTerminalScrollingOptions): UseTerminalScrollingReturn {
  const copyModeStateRef = useRef<CopyModeState>({
    inCopyMode: false,
    timeout: null,
    consecutiveDownScrolls: 0,
  });

  // Enter copy-mode if not already in it
  const enterCopyMode = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const state = copyModeStateRef.current;

    // Clear existing timeout
    if (state.timeout) clearTimeout(state.timeout);

    // Enter copy-mode if not already in it
    if (!state.inCopyMode) {
      wsRef.current.send('\x02['); // Ctrl+B [
      state.inCopyMode = true;
    }

    // Reset timeout - assume exit after inactivity
    state.timeout = setTimeout(() => {
      state.inCopyMode = false;
      state.timeout = null;
    }, COPY_MODE_TIMEOUT_MS);
  }, [wsRef]);

  // Exit copy-mode by sending 'q' and resetting state
  const exitCopyMode = useCallback(() => {
    const state = copyModeStateRef.current;
    if (!state.inCopyMode) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    // Send 'q' to exit tmux copy-mode
    wsRef.current.send('q');

    // Reset all state
    state.inCopyMode = false;
    state.consecutiveDownScrolls = 0;
    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }
  }, [wsRef]);

  // Send scroll command in copy-mode (Ctrl+U up, Ctrl+D down)
  // Tracks consecutive down-scrolls to auto-exit when user scrolls to bottom
  const sendScrollCommand = useCallback((direction: 'up' | 'down') => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;

    const state = copyModeStateRef.current;

    if (direction === 'up') {
      // Scrolling up = reading history, reset down counter
      state.consecutiveDownScrolls = 0;
    } else {
      // Scrolling down = heading back toward bottom
      state.consecutiveDownScrolls++;

      // Auto-exit after threshold consecutive down-scrolls
      if (state.consecutiveDownScrolls >= COPY_MODE_EXIT_SCROLL_THRESHOLD) {
        exitCopyMode();
        return; // Don't send scroll command, we're exiting
      }
    }

    wsRef.current.send(direction === 'up' ? '\x15' : '\x04');
  }, [wsRef, exitCopyMode]);

  // Reset copy-mode state (on user input)
  const resetCopyMode = useCallback(() => {
    const state = copyModeStateRef.current;
    state.consecutiveDownScrolls = 0;
    if (state.inCopyMode) {
      state.inCopyMode = false;
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
    }
  }, []);

  // Set up scrolling handlers on a container element
  const setupScrolling = useCallback((container: HTMLElement): ScrollingSetupResult => {
    const state = copyModeStateRef.current;

    // Wheel handler for desktop scrolling
    const handleWheel = (e: WheelEvent) => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      e.preventDefault();
      e.stopPropagation();

      enterCopyMode();
      sendScrollCommand(e.deltaY < 0 ? 'up' : 'down');
    };

    container.addEventListener('wheel', handleWheel, { capture: true, passive: false });

    const wheelCleanup = () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
    };

    // Touch handlers for mobile scrolling
    let touchStartY = 0;
    let lastSentY = 0;
    let touchCleanup = () => {};

    if (isMobile) {
      const handleTouchStart = (e: TouchEvent) => {
        touchStartY = e.touches[0].clientY;
        lastSentY = touchStartY;
        enterCopyMode();
      };

      const handleTouchMove = (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const currentY = e.touches[0].clientY;
        const deltaY = lastSentY - currentY;
        if (Math.abs(deltaY) >= SCROLL_THRESHOLD) {
          sendScrollCommand(deltaY > 0 ? 'down' : 'up');
          lastSentY = currentY;
        }
      };

      const handleTouchEnd = () => {
        touchStartY = 0;
        lastSentY = 0;
      };

      container.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
      container.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
      container.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });

      touchCleanup = () => {
        container.removeEventListener('touchstart', handleTouchStart, { capture: true });
        container.removeEventListener('touchmove', handleTouchMove, { capture: true });
        container.removeEventListener('touchend', handleTouchEnd, { capture: true });
      };
    }

    return { wheelCleanup, touchCleanup };
  }, [wsRef, isMobile, enterCopyMode, sendScrollCommand]);

  // Cleanup on unmount
  useEffect(() => {
    const state = copyModeStateRef.current;
    return () => {
      if (state.timeout) {
        clearTimeout(state.timeout);
        state.timeout = null;
      }
    };
  }, []);

  return {
    copyModeStateRef,
    setupScrolling,
    resetCopyMode,
  };
}

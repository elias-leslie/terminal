"use client";

import { useCallback } from "react";
import type { Terminal } from "@xterm/xterm";
import { SCROLL_THRESHOLD } from "../constants/terminal";

interface UseTerminalScrollingOptions {
  /** WebSocket ref for sending input to terminal */
  wsRef: React.RefObject<WebSocket | null>;
  /** Terminal instance ref for buffer type detection */
  terminalRef: React.RefObject<Terminal | null>;
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
  /** Set up scrolling handlers on a container element */
  setupScrolling: (container: HTMLElement) => ScrollingSetupResult;
}

// Arrow key escape sequences (application mode)
const ARROW_UP = "\x1b[A";
const ARROW_DOWN = "\x1b[A".replace("A", "B"); // \x1b[B

/**
 * Check if terminal is in alternate screen mode (vim, less, htop, etc.)
 *
 * Alternate screen is used by full-screen applications like vim, less, htop.
 * In alternate mode, we send arrow keys for scrolling.
 * In normal mode, xterm.js handles scrolling natively via its scrollback buffer.
 */
function isAlternateScreen(terminal: Terminal): boolean {
  return terminal.buffer.active.type === "alternate";
}

/**
 * Hook for managing terminal scrolling with alternate screen detection.
 *
 * Handles:
 * - Normal mode: xterm.js handles scroll natively (no intervention)
 * - Alternate mode: Send arrow keys for vim/less/htop scrolling
 *
 * @example
 * ```tsx
 * const { setupScrolling } = useTerminalScrolling({
 *   wsRef,
 *   terminalRef,
 *   isMobile: isMobileDevice(),
 * });
 *
 * // In terminal init effect:
 * const { wheelCleanup, touchCleanup } = setupScrolling(containerRef.current);
 * ```
 */
export function useTerminalScrolling({
  wsRef,
  terminalRef,
  isMobile,
}: UseTerminalScrollingOptions): UseTerminalScrollingReturn {
  // Send arrow key to terminal for alternate screen scrolling
  const sendArrowKey = useCallback(
    (direction: "up" | "down") => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(direction === "up" ? ARROW_UP : ARROW_DOWN);
    },
    [wsRef],
  );

  // Set up scrolling handlers on a container element
  const setupScrolling = useCallback(
    (container: HTMLElement): ScrollingSetupResult => {
      // Wheel handler for desktop scrolling
      // - Normal mode: Don't prevent default, let xterm.js scroll natively
      // - Alternate mode: Prevent default, send arrow keys
      const handleWheel = (e: WheelEvent) => {
        const terminal = terminalRef.current;
        if (!terminal) return;

        // Check if in alternate screen (vim, less, etc.)
        if (isAlternateScreen(terminal)) {
          // Prevent xterm.js native scroll, send arrow keys instead
          e.preventDefault();
          e.stopPropagation();

          // Send multiple arrow keys for faster scrolling based on delta
          const lines = Math.max(1, Math.floor(Math.abs(e.deltaY) / 40));
          const direction = e.deltaY < 0 ? "up" : "down";
          for (let i = 0; i < lines; i++) {
            sendArrowKey(direction);
          }
        }
        // In normal mode, don't prevent default - let xterm.js handle it natively
      };

      container.addEventListener("wheel", handleWheel, {
        capture: true,
        passive: false,
      });

      const wheelCleanup = () => {
        container.removeEventListener("wheel", handleWheel, { capture: true });
      };

      // Touch handlers for mobile scrolling
      let touchStartY = 0;
      let lastSentY = 0;
      let touchCleanup = () => {};

      if (isMobile) {
        const handleTouchStart = (e: TouchEvent) => {
          touchStartY = e.touches[0].clientY;
          lastSentY = touchStartY;
        };

        const handleTouchMove = (e: TouchEvent) => {
          const terminal = terminalRef.current;
          if (!terminal) return;

          // Check if in alternate screen
          if (isAlternateScreen(terminal)) {
            e.preventDefault();
            e.stopPropagation();

            const currentY = e.touches[0].clientY;
            const deltaY = lastSentY - currentY;

            if (Math.abs(deltaY) >= SCROLL_THRESHOLD) {
              sendArrowKey(deltaY > 0 ? "down" : "up");
              lastSentY = currentY;
            }
          }
          // In normal mode, don't prevent - let xterm.js scroll natively
        };

        const handleTouchEnd = () => {
          touchStartY = 0;
          lastSentY = 0;
        };

        container.addEventListener("touchstart", handleTouchStart, {
          passive: true,
          capture: true,
        });
        container.addEventListener("touchmove", handleTouchMove, {
          passive: false,
          capture: true,
        });
        container.addEventListener("touchend", handleTouchEnd, {
          passive: true,
          capture: true,
        });

        touchCleanup = () => {
          container.removeEventListener("touchstart", handleTouchStart, {
            capture: true,
          });
          container.removeEventListener("touchmove", handleTouchMove, {
            capture: true,
          });
          container.removeEventListener("touchend", handleTouchEnd, {
            capture: true,
          });
        };
      }

      return { wheelCleanup, touchCleanup };
    },
    [terminalRef, isMobile, sendArrowKey],
  );

  return {
    setupScrolling,
  };
}

"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { clsx } from "clsx";
import "@xterm/xterm/css/xterm.css";
import {
  SCROLLBACK,
  MOBILE_WIDTH_THRESHOLD,
  FIT_DELAY_MS,
  RESIZE_DEBOUNCE_MS,
  PHOSPHOR_THEME,
} from "../lib/constants/terminal";
import { useTerminalWebSocket } from "../lib/hooks/use-terminal-websocket";
import { useTerminalScrolling } from "../lib/hooks/use-terminal-scrolling";

// Dynamic imports for xterm (client-side only)
let Terminal: typeof import("@xterm/xterm").Terminal;
let FitAddon: typeof import("@xterm/addon-fit").FitAddon;
let WebLinksAddon: typeof import("@xterm/addon-web-links").WebLinksAddon;
let ClipboardAddon: typeof import("@xterm/addon-clipboard").ClipboardAddon;

interface TerminalProps {
  sessionId: string;
  workingDir?: string;
  className?: string;
  onDisconnect?: () => void;
  onStatusChange?: (status: ConnectionStatus) => void;
  fontFamily?: string;
  fontSize?: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error" | "session_dead" | "timeout";

export interface TerminalHandle {
  reconnect: () => void;
  getContent: () => string;
  sendInput: (data: string) => void;
  status: ConnectionStatus;
}

// Check if we're on a mobile device (used for pull-to-refresh prevention)
function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  ) || window.innerWidth < MOBILE_WIDTH_THRESHOLD;
}

export const TerminalComponent = forwardRef<TerminalHandle, TerminalProps>(function TerminalComponent({
  sessionId,
  workingDir,
  className,
  onDisconnect,
  onStatusChange,
  fontFamily = "'JetBrains Mono', monospace",
  fontSize = 14,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<InstanceType<typeof Terminal> | null>(null);
  const fitAddonRef = useRef<InstanceType<typeof FitAddon> | null>(null);
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);
  const scrollCleanupRef = useRef<{ wheelCleanup: () => void; touchCleanup: () => void } | null>(null);

  // WebSocket connection management via hook
  const { status, wsRef, reconnect, sendInput, connect } = useTerminalWebSocket({
    sessionId,
    workingDir,
    onStatusChange,
    onDisconnect,
    onMessage: (data) => {
      if (!terminalRef.current) return;
      // Preserve scroll position if user is viewing history
      const buffer = terminalRef.current.buffer.active;
      const distanceFromBottom = buffer.baseY - buffer.viewportY;
      terminalRef.current.write(data);
      // Restore scroll position if user wasn't at bottom
      if (distanceFromBottom > 0) {
        terminalRef.current.scrollLines(-distanceFromBottom);
      }
    },
    onTerminalMessage: (message) => {
      terminalRef.current?.writeln(message);
    },
    getDimensions: () => fitAddonRef.current?.proposeDimensions() ?? null,
  });

  // Scrolling management via hook
  const { setupScrolling, resetCopyMode } = useTerminalScrolling({
    wsRef,
    isMobile: isMobileDevice(),
  });

  // Expose functions to parent
  useImperativeHandle(ref, () => ({
    reconnect,
    getContent: () => {
      if (!terminalRef.current) return "";
      // Select all text and get the selection
      terminalRef.current.selectAll();
      const content = terminalRef.current.getSelection();
      terminalRef.current.clearSelection();
      return content;
    },
    sendInput,
    status,
  }), [status, reconnect, sendInput]);

  // Handle resize - always fit the terminal, send dims only if WS connected
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && terminalRef.current) {
      fitAddonRef.current.fit();

      // Only send resize to backend if WS is connected
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const dims = fitAddonRef.current.proposeDimensions();
        if (dims) {
          wsRef.current.send(
            JSON.stringify({
              resize: { cols: dims.cols, rows: dims.rows },
            })
          );
        }
      }
    }
  }, []);

  // Initialize terminal
  useEffect(() => {
    let mounted = true;

    async function initTerminal() {
      if (!containerRef.current) return;

      // Dynamic import xterm modules
      const xtermModule = await import("@xterm/xterm");
      const fitModule = await import("@xterm/addon-fit");
      const webLinksModule = await import("@xterm/addon-web-links");
      const clipboardModule = await import("@xterm/addon-clipboard");

      if (!mounted) return;

      Terminal = xtermModule.Terminal;
      FitAddon = fitModule.FitAddon;
      WebLinksAddon = webLinksModule.WebLinksAddon;
      ClipboardAddon = clipboardModule.ClipboardAddon;

      // Create terminal with Phosphor theme
      const term = new Terminal({
        cursorBlink: true,
        fontSize: fontSize,
        fontFamily: fontFamily,
        scrollback: SCROLLBACK,
        allowProposedApi: true,
        rightClickSelectsWord: true,
        macOptionClickForcesSelection: true,
        altClickMovesCursor: false,
        theme: PHOSPHOR_THEME,
      });

      // Create and load addons
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const clipboardAddon = new ClipboardAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(clipboardAddon);

      // Open terminal in container
      term.open(containerRef.current);

      // Force local mouse handling only when mouse reporting is enabled.
      // Check xterm's internal coreMouseService.areMouseEventsActive property.
      // When mouse reporting is OFF (regular bash), we let events pass through.
      const forceLocalMouseHandling = (e: MouseEvent) => {
        if (e.shiftKey) return; // Already has shift (including our synthetic events), let it through
        if (!e.isTrusted) return; // Skip synthetic events to prevent loops

        // Check if mouse reporting is enabled via xterm internal API
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const core = (term as any)._core;
        const mouseService = core?.coreMouseService;
        const mouseActive = mouseService?.areMouseEventsActive;

        if (!mouseActive) {
          // Mouse reporting not enabled, let event pass through normally
          return;
        }

        // Mouse reporting is enabled - intercept and force local handling
        e.stopPropagation();
        e.preventDefault();

        // Create new event with shiftKey=true
        const newEvent = new MouseEvent(e.type, {
          bubbles: e.bubbles,
          cancelable: e.cancelable,
          view: e.view,
          detail: e.detail,
          screenX: e.screenX,
          screenY: e.screenY,
          clientX: e.clientX,
          clientY: e.clientY,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: true, // Force shiftKey for local selection
          metaKey: e.metaKey,
          button: e.button,
          buttons: e.buttons,
          relatedTarget: e.relatedTarget,
        });

        e.target?.dispatchEvent(newEvent);
      };
      const mouseContainer = containerRef.current;
      mouseContainer.addEventListener('mousedown', forceLocalMouseHandling, { capture: true });
      mouseContainer.addEventListener('mouseup', forceLocalMouseHandling, { capture: true });
      mouseContainer.addEventListener('mousemove', forceLocalMouseHandling, { capture: true });

      // Store cleanup function for mouse listeners
      mouseCleanupRef.current = () => {
        mouseContainer.removeEventListener('mousedown', forceLocalMouseHandling, { capture: true });
        mouseContainer.removeEventListener('mouseup', forceLocalMouseHandling, { capture: true });
        mouseContainer.removeEventListener('mousemove', forceLocalMouseHandling, { capture: true });
      };

      // Set up scrolling via hook (handles wheel and touch events for tmux copy-mode)
      scrollCleanupRef.current = setupScrolling(containerRef.current);

      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      // Mobile-specific setup: suppress native keyboard (we use custom keyboard)
      if (isMobileDevice()) {
        const textarea = containerRef.current.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea");
        if (textarea) {
          textarea.inputMode = "none";
          textarea.readOnly = true;
        }

        // Prevent pull-to-refresh via CSS
        containerRef.current.style.overscrollBehavior = 'none';
        containerRef.current.style.touchAction = 'none';
      }

      // Fit immediately and again after a short delay to ensure proper sizing
      fitAddon.fit();
      setTimeout(() => {
        if (mounted && fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      }, FIT_DELAY_MS);

      // Set up terminal input handler - forward to WebSocket and reset copy-mode on typing
      onDataDisposableRef.current = term.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(data);
          // Typing exits tmux copy-mode, reset our tracking
          resetCopyMode();
        }
      });

      // Connect to WebSocket via hook
      connect();
      window.addEventListener("resize", handleResize);
    }

    initTerminal();

    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
      // Dispose onData listener before terminal
      if (onDataDisposableRef.current) {
        onDataDisposableRef.current.dispose();
        onDataDisposableRef.current = null;
      }
      // Clean up mouse listeners
      if (mouseCleanupRef.current) {
        mouseCleanupRef.current();
        mouseCleanupRef.current = null;
      }
      // Clean up scroll listeners
      if (scrollCleanupRef.current) {
        scrollCleanupRef.current.wheelCleanup();
        scrollCleanupRef.current.touchCleanup();
        scrollCleanupRef.current = null;
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, workingDir, handleResize, connect, setupScrolling, resetCopyMode]);

  // Handle container resize with debounce
  useEffect(() => {
    if (!containerRef.current) return;
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
    let lastWidth = 0;
    let lastHeight = 0;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => handleResize(), RESIZE_DEBOUNCE_MS);
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeObserver.disconnect();
    };
  }, [handleResize]);

  // Update font settings when they change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontFamily = fontFamily;
      terminalRef.current.options.fontSize = fontSize;
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }
  }, [fontFamily, fontSize]);

  return (
    <div className={clsx("relative overflow-hidden", className)}>
      {/* Terminal container */}
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{ backgroundColor: PHOSPHOR_THEME.background }}
      />
    </div>
  );
});

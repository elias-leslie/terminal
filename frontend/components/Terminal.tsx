"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { clsx } from "clsx";
import "@xterm/xterm/css/xterm.css";
import {
  CONNECTION_TIMEOUT,
  RETRY_BACKOFF,
  SCROLL_THRESHOLD,
  SCROLLBACK,
  COPY_MODE_TIMEOUT,
} from "../lib/constants/terminal";

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
  ) || window.innerWidth < 768;
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
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const connectWebSocketRef = useRef<(() => void) | null>(null);

  // Store callback in ref to avoid re-render loops
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Notify parent of status changes (uses ref to avoid dependency on callback)
  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  // Expose functions to parent
  useImperativeHandle(ref, () => ({
    reconnect: () => {
      if (connectWebSocketRef.current) {
        // Close existing connection if any
        if (wsRef.current) {
          wsRef.current.close();
        }
        terminalRef.current?.writeln("\x1b[33mReconnecting...\x1b[0m");
        setStatus("connecting");
        connectWebSocketRef.current();
      }
    },
    getContent: () => {
      if (!terminalRef.current) return "";
      // Select all text and get the selection
      terminalRef.current.selectAll();
      const content = terminalRef.current.getSelection();
      terminalRef.current.clearSelection();
      return content;
    },
    sendInput: (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    },
    status,
  }), [status]);

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
        scrollback: 5000,
        allowProposedApi: true,
        rightClickSelectsWord: true,
        macOptionClickForcesSelection: true,
        altClickMovesCursor: false,
        theme: {
          // Phosphor Terminal Theme
          background: "#0a0e14",
          foreground: "#e6edf3",
          cursor: "#00ff9f",
          cursorAccent: "#0a0e14",
          selectionBackground: "rgba(0, 255, 159, 0.3)",
          selectionForeground: "#e6edf3",
          black: "#0f1419",
          red: "#f85149",
          green: "#00ff9f",
          yellow: "#d29922",
          blue: "#58a6ff",
          magenta: "#bc8cff",
          cyan: "#39c5cf",
          white: "#e6edf3",
          brightBlack: "#7d8590",
          brightRed: "#ffa198",
          brightGreen: "#56d364",
          brightYellow: "#e3b341",
          brightBlue: "#79c0ff",
          brightMagenta: "#d2a8ff",
          brightCyan: "#56d4dd",
          brightWhite: "#ffffff",
        },
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
      containerRef.current.addEventListener('mousedown', forceLocalMouseHandling, { capture: true });
      containerRef.current.addEventListener('mouseup', forceLocalMouseHandling, { capture: true });
      containerRef.current.addEventListener('mousemove', forceLocalMouseHandling, { capture: true });

      // SCROLLBACK ARCHITECTURE NOTE:
      // xterm.js scrollback does NOT work with tmux because tmux controls what's displayed.
      // xterm.js only receives the current viewport from tmux (e.g., 37 lines).
      // The scrollback history is stored in tmux's buffer, not xterm.js's buffer.
      //
      // For scrollback, users must use tmux copy-mode:
      // - Desktop: Ctrl+B [ to enter copy-mode, then scroll with arrows/PgUp/PgDn
      // - Mobile: Touch gestures already send tmux copy-mode commands
      //
      // We handle wheel events to enter tmux copy-mode and scroll within it.
      let inCopyMode = false;
      let copyModeTimeout: ReturnType<typeof setTimeout> | null = null;

      const handleWheel = (e: WheelEvent) => {
        // Only handle if WS is connected
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;

        // Prevent default browser scroll
        e.preventDefault();
        e.stopPropagation();

        // Enter tmux copy-mode if not already in it
        if (!inCopyMode) {
          wsRef.current.send('\x02['); // Ctrl+B [
          inCopyMode = true;
        }

        // Reset copy-mode exit timeout
        if (copyModeTimeout) clearTimeout(copyModeTimeout);
        copyModeTimeout = setTimeout(() => {
          // Exit copy-mode after 2 seconds of no scrolling
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('q'); // 'q' exits copy-mode
          }
          inCopyMode = false;
        }, 2000);

        // Send scroll commands to tmux copy-mode
        // In copy-mode: Ctrl+U = half page up, Ctrl+D = half page down
        // These actually scroll the view, not just move cursor
        if (e.deltaY < 0) {
          // Scroll up (see older content)
          wsRef.current.send('\x15'); // Ctrl+U = half page up
        } else {
          // Scroll down (see newer content)
          wsRef.current.send('\x04'); // Ctrl+D = half page down
        }
      };

      const wheelContainer = containerRef.current;
      wheelContainer.addEventListener('wheel', handleWheel, { capture: true, passive: false });

      // Store wheel cleanup
      (term as unknown as { _wheelCleanup?: () => void })._wheelCleanup = () => {
        wheelContainer.removeEventListener('wheel', handleWheel, { capture: true });
        if (copyModeTimeout) {
          clearTimeout(copyModeTimeout);
        }
      };

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

        // Touch scrolling - send scroll commands to tmux via WebSocket
        let touchStartY = 0;
        let lastSentY = 0;
        let inCopyMode = false;
        const SCROLL_THRESHOLD = 50;
        const container = containerRef.current;

        const handleTouchStart = (e: TouchEvent) => {
          if (!container.contains(e.target as Node)) return;
          touchStartY = e.touches[0].clientY;
          lastSentY = touchStartY;
          if (!inCopyMode && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('\x02[');
            inCopyMode = true;
          }
        };

        const handleTouchMove = (e: TouchEvent) => {
          if (!container.contains(e.target as Node)) return;
          e.preventDefault();
          e.stopPropagation();
          const currentY = e.touches[0].clientY;
          const deltaY = lastSentY - currentY;
          if (Math.abs(deltaY) >= SCROLL_THRESHOLD) {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              if (deltaY > 0) {
                wsRef.current.send('\x04');
              } else {
                wsRef.current.send('\x15');
              }
            }
            lastSentY = currentY;
          }
        };

        const handleTouchEnd = () => {
          touchStartY = 0;
          lastSentY = 0;
        };

        document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
        document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });

        (term as unknown as { _touchCleanup?: () => void })._touchCleanup = () => {
          document.removeEventListener('touchstart', handleTouchStart, { capture: true });
          document.removeEventListener('touchmove', handleTouchMove, { capture: true });
          document.removeEventListener('touchend', handleTouchEnd, { capture: true });
        };
      }

      // Fit immediately and again after a short delay to ensure proper sizing
      fitAddon.fit();
      setTimeout(() => {
        if (mounted && fitAddonRef.current) {
          fitAddonRef.current.fit();
        }
      }, 100);

      // Connect to WebSocket with timeout and auto-retry
      const CONNECTION_TIMEOUT = 10000;
      const RETRY_BACKOFF = 2000;
      let hasRetried = false;

      function connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        let wsHost: string;

        if (window.location.host === "terminal.summitflow.dev") {
          wsHost = "terminalapi.summitflow.dev";
        } else if (window.location.host.includes("localhost")) {
          wsHost = "localhost:8002";
        } else {
          wsHost = window.location.host;
        }

        let wsUrl = `${protocol}//${wsHost}/ws/terminal/${sessionId}`;
        if (workingDir) {
          wsUrl += `?working_dir=${encodeURIComponent(workingDir)}`;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        const timeoutId = setTimeout(() => {
          if (ws.readyState === WebSocket.CONNECTING) {
            ws.close();
            if (!mounted) return;
            if (!hasRetried) {
              hasRetried = true;
              term.writeln("\x1b[33mConnection timeout, retrying...\x1b[0m");
              setStatus("connecting");
              setTimeout(() => {
                if (mounted) connectWebSocket();
              }, RETRY_BACKOFF);
            } else {
              setStatus("timeout");
              term.writeln("\r\n\x1b[31mConnection timeout\x1b[0m");
              onDisconnect?.();
            }
          }
        }, CONNECTION_TIMEOUT);

        ws.onopen = () => {
          clearTimeout(timeoutId);
          if (!mounted) return;
          setStatus("connected");
          term.writeln("Connected to terminal session: " + sessionId);
          term.writeln("");

          // Send initial size
          const dims = fitAddon.proposeDimensions();
          if (dims) {
            ws.send(JSON.stringify({ resize: { cols: dims.cols, rows: dims.rows } }));
          }
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          term.write(event.data);
        };

        ws.onclose = (event) => {
          clearTimeout(timeoutId);
          if (!mounted) return;
          if (event.code === 4000) {
            setStatus("session_dead");
            try {
              const reason = JSON.parse(event.reason);
              term.writeln(`\r\n\x1b[31m${reason.message || "Session not found"}\x1b[0m`);
            } catch {
              term.writeln("\r\n\x1b[31mSession not found or could not be restored\x1b[0m");
            }
          } else {
            setStatus("disconnected");
            term.writeln("\r\n\x1b[31mDisconnected from terminal\x1b[0m");
          }
          onDisconnect?.();
        };

        ws.onerror = () => {
          clearTimeout(timeoutId);
          if (!mounted) return;
          setStatus("error");
          term.writeln("\r\n\x1b[31mConnection error\x1b[0m");
        };

        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });
      }

      connectWebSocketRef.current = connectWebSocket;
      connectWebSocket();
      window.addEventListener("resize", handleResize);
    }

    initTerminal();

    return () => {
      mounted = false;
      window.removeEventListener("resize", handleResize);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (terminalRef.current) {
        const touchCleanup = (terminalRef.current as unknown as { _touchCleanup?: () => void })._touchCleanup;
        if (touchCleanup) touchCleanup();
        const wheelCleanup = (terminalRef.current as unknown as { _wheelCleanup?: () => void })._wheelCleanup;
        if (wheelCleanup) wheelCleanup();
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, workingDir, handleResize, onDisconnect]);

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
      resizeTimeout = setTimeout(() => handleResize(), 50);
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
        style={{ backgroundColor: "#0a0e14" }}
      />
    </div>
  );
});

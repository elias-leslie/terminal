"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import {
  CONNECTION_TIMEOUT,
  RETRY_BACKOFF,
  WS_CLOSE_CODE_SESSION_DEAD,
} from "../constants/terminal";
import type { ConnectionStatus } from "../../components/Terminal";

interface UseTerminalWebSocketOptions {
  sessionId: string;
  workingDir?: string;
  /** Called when connection status changes */
  onStatusChange?: (status: ConnectionStatus) => void;
  /** Called when the WebSocket disconnects */
  onDisconnect?: () => void;
  /** Called when data is received from the server */
  onMessage?: (data: string) => void;
  /** Called when terminal should display a message */
  onTerminalMessage?: (message: string) => void;
  /** Get current terminal dimensions for resize message */
  getDimensions?: () => { cols: number; rows: number } | null;
}

interface UseTerminalWebSocketReturn {
  /** Current connection status */
  status: ConnectionStatus;
  /** WebSocket ref for external access (sending data) */
  wsRef: React.RefObject<WebSocket | null>;
  /** Manually reconnect */
  reconnect: () => void;
  /** Send data to the server */
  sendInput: (data: string) => void;
  /** Connect to WebSocket (called by terminal init) */
  connect: () => void;
  /** Disconnect from WebSocket */
  disconnect: () => void;
}

/**
 * Hook for managing WebSocket connection to terminal backend.
 *
 * Handles:
 * - Connection with timeout and single retry
 * - Status tracking (connecting, connected, disconnected, error, session_dead, timeout)
 * - Automatic reconnection on timeout
 * - Message forwarding
 *
 * @example
 * ```tsx
 * const { status, connect, sendInput, wsRef } = useTerminalWebSocket({
 *   sessionId: "abc-123",
 *   onMessage: (data) => terminal.write(data),
 *   onTerminalMessage: (msg) => terminal.writeln(msg),
 *   getDimensions: () => fitAddon.proposeDimensions(),
 * });
 * ```
 */
export function useTerminalWebSocket({
  sessionId,
  workingDir,
  onStatusChange,
  onDisconnect,
  onMessage,
  onTerminalMessage,
  getDimensions,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const hasRetriedRef = useRef(false);
  const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectRef = useRef<() => void>();

  // Store callbacks in refs to avoid re-render loops
  const onStatusChangeRef = useRef(onStatusChange);
  const onDisconnectRef = useRef(onDisconnect);
  const onMessageRef = useRef(onMessage);
  const onTerminalMessageRef = useRef(onTerminalMessage);
  const getDimensionsRef = useRef(getDimensions);

  // Update refs when callbacks change
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onDisconnectRef.current = onDisconnect;
    onMessageRef.current = onMessage;
    onTerminalMessageRef.current = onTerminalMessage;
    getDimensionsRef.current = getDimensions;
  }, [onStatusChange, onDisconnect, onMessage, onTerminalMessage, getDimensions]);

  // Notify parent of status changes
  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  // Track mounted state for cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const connect = useCallback(() => {
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

    // Set up connection timeout
    timeoutIdRef.current = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
        if (!mountedRef.current) return;

        if (!hasRetriedRef.current) {
          hasRetriedRef.current = true;
          onTerminalMessageRef.current?.("\x1b[33mConnection timeout, retrying...\x1b[0m");
          setStatus("connecting");
          setTimeout(() => {
            if (mountedRef.current) connect();
          }, RETRY_BACKOFF);
        } else {
          setStatus("timeout");
          onTerminalMessageRef.current?.("\r\n\x1b[31mConnection timeout\x1b[0m");
          onDisconnectRef.current?.();
        }
      }
    }, CONNECTION_TIMEOUT);

    ws.onopen = () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (!mountedRef.current) return;

      setStatus("connected");
      onTerminalMessageRef.current?.("Connected to terminal session: " + sessionId);
      onTerminalMessageRef.current?.("");

      // Send initial size
      const dims = getDimensionsRef.current?.();
      if (dims) {
        ws.send(JSON.stringify({ resize: { cols: dims.cols, rows: dims.rows } }));
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      onMessageRef.current?.(event.data);
    };

    ws.onclose = (event) => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (!mountedRef.current) return;

      if (event.code === WS_CLOSE_CODE_SESSION_DEAD) {
        setStatus("session_dead");
        try {
          const reason = JSON.parse(event.reason);
          onTerminalMessageRef.current?.(`\r\n\x1b[31m${reason.message || "Session not found"}\x1b[0m`);
        } catch {
          onTerminalMessageRef.current?.("\r\n\x1b[31mSession not found or could not be restored\x1b[0m");
        }
      } else {
        setStatus("disconnected");
        onTerminalMessageRef.current?.("\r\n\x1b[31mDisconnected from terminal\x1b[0m");
      }
      onDisconnectRef.current?.();
    };

    ws.onerror = () => {
      if (timeoutIdRef.current) clearTimeout(timeoutIdRef.current);
      if (!mountedRef.current) return;
      setStatus("error");
      onTerminalMessageRef.current?.("\r\n\x1b[31mConnection error\x1b[0m");
    };
  }, [sessionId, workingDir]);

  const disconnect = useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const reconnect = useCallback(() => {
    disconnect();
    hasRetriedRef.current = false;
    onTerminalMessageRef.current?.("\x1b[33mReconnecting...\x1b[0m");
    setStatus("connecting");
    connect();
  }, [connect, disconnect]);

  const sendInput = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    wsRef,
    reconnect,
    sendInput,
    connect,
    disconnect,
  };
}

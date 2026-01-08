"use client";

import { clsx } from "clsx";
import { TerminalComponent, type TerminalHandle } from "./Terminal";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { type TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import { type ConnectionStatus } from "./terminal.types";
import { useLazyMount } from "@/lib/hooks/use-lazy-mount";

// Maximum number of terminals to keep mounted (for quick switching)
const MAX_MOUNTED_TERMINALS = 3;

interface SingleModeTerminalsProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  projectPath?: string;
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  onTerminalRef: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void;
}

export function SingleModeTerminals({
  sessions,
  activeSessionId,
  projectPath,
  fontFamily,
  fontSize,
  scrollback,
  onTerminalRef,
  onStatusChange,
}: SingleModeTerminalsProps) {
  // Use lazy mount hook to track which sessions should be rendered
  const mountedSessionIds = useLazyMount(
    activeSessionId,
    MAX_MOUNTED_TERMINALS,
  );

  return (
    <>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        const isMounted = mountedSessionIds.has(session.id);

        // Only render mounted terminals
        if (!isMounted) {
          return null;
        }

        const showClaudeOverlay =
          session.mode === "claude" &&
          session.claude_state !== "running" &&
          session.claude_state !== "stopped" &&
          session.claude_state !== "error";

        return (
          <div
            key={session.id}
            className={clsx(
              "absolute inset-0 overflow-hidden flex flex-col",
              isActive ? "z-10 visible" : "z-0 invisible",
            )}
          >
            <TerminalComponent
              ref={(handle) => onTerminalRef(session.id, handle)}
              sessionId={session.id}
              workingDir={session.working_dir || projectPath}
              className="flex-1"
              fontFamily={fontFamily}
              fontSize={fontSize}
              scrollback={scrollback}
              isVisible={isActive}
              onStatusChange={(status) => onStatusChange(session.id, status)}
            />
            {showClaudeOverlay && <ClaudeLoadingOverlay variant="normal" />}
          </div>
        );
      })}
    </>
  );
}

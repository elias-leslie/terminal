"use client";

import { clsx } from "clsx";
import { TerminalComponent, type TerminalHandle } from "./Terminal";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { type TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import { type ConnectionStatus } from "./terminal.types";

interface SingleModeTerminalsProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  projectPath?: string;
  fontFamily: string;
  fontSize: number;
  onTerminalRef: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void;
}

export function SingleModeTerminals({
  sessions,
  activeSessionId,
  projectPath,
  fontFamily,
  fontSize,
  onTerminalRef,
  onStatusChange,
}: SingleModeTerminalsProps) {
  return (
    <>
      {sessions.map((session) => {
        const showClaudeOverlay = session.mode === "claude" &&
          session.claude_state !== "running" &&
          session.claude_state !== "stopped" &&
          session.claude_state !== "error";

        return (
          <div
            key={session.id}
            className={clsx(
              "absolute inset-0 overflow-hidden flex flex-col",
              session.id === activeSessionId ? "z-10 visible" : "z-0 invisible"
            )}
          >
            <TerminalComponent
              ref={(handle) => onTerminalRef(session.id, handle)}
              sessionId={session.id}
              workingDir={session.working_dir || projectPath}
              className="flex-1"
              fontFamily={fontFamily}
              fontSize={fontSize}
              isVisible={session.id === activeSessionId}
              onStatusChange={(status) => onStatusChange(session.id, status)}
            />
            {showClaudeOverlay && <ClaudeLoadingOverlay variant="normal" />}
          </div>
        );
      })}
    </>
  );
}

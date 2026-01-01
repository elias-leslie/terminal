"use client";

import { RefObject } from "react";
import { clsx } from "clsx";
import { ConnectionStatus } from "./Terminal";
import { TabActionMenu } from "./TabActionMenu";
import { TerminalSession } from "@/lib/hooks/use-terminal-sessions";

// ============================================================================
// Utility Functions
// ============================================================================

function getTabClassName(isActive: boolean, isMobile: boolean): string {
  return clsx(
    "flex items-center rounded-md transition-all duration-200 cursor-pointer",
    "group min-w-0 flex-shrink-0",
    isMobile
      ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
      : "gap-1.5 px-2 py-1.5 text-sm",
    isActive
      ? "tab-active"
      : "tab-inactive"
  );
}

// ============================================================================
// Types
// ============================================================================

export interface AdHocTabProps {
  // Session data
  session: TerminalSession;
  sessionStatus?: ConnectionStatus;

  // Active state
  isActive: boolean;

  // Handlers
  onClick: (sessionId: string) => void;
  onReset: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;

  // Tab editing
  isEditing: boolean;
  editValue: string;
  setEditValue: (value: string) => void;
  editInputRef: RefObject<HTMLInputElement | null>;
  startEdit: (sessionId: string, currentName: string) => void;
  saveEdit: () => void;
  handleEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  // UI state
  isMobile: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function AdHocTab({
  session,
  sessionStatus,
  isActive,
  onClick,
  onReset,
  onRemove,
  isEditing,
  editValue,
  setEditValue,
  editInputRef,
  startEdit,
  saveEdit,
  handleEditKeyDown,
  isMobile,
}: AdHocTabProps) {
  return (
    <div
      onClick={() => onClick(session.id)}
      className={getTabClassName(isActive, isMobile)}
    >
      {/* Status dot for ad-hoc tabs */}
      <span
        className={clsx("w-2 h-2 rounded-full flex-shrink-0", {
          "animate-pulse": sessionStatus === "connecting",
        })}
        style={{
          backgroundColor:
            sessionStatus === "connected" ? "var(--term-accent)" :
            sessionStatus === "connecting" ? "var(--term-warning)" :
            sessionStatus === "error" || sessionStatus === "timeout" ? "var(--term-error)" :
            sessionStatus === "session_dead" ? "var(--term-warning)" :
            "var(--term-text-muted)",
          boxShadow: sessionStatus === "connected" ? "0 0 6px var(--term-accent)" : "none",
        }}
        title={sessionStatus || "unknown"}
      />
      {/* Tab content */}
      <div className="flex items-center">
        {isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleEditKeyDown}
            className="rounded px-1 py-0 text-sm w-24 focus:outline-none focus:ring-1"
            style={{
              backgroundColor: "var(--term-bg-deep)",
              borderColor: "var(--term-accent)",
              color: "var(--term-text-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={clsx("truncate", isMobile ? "max-w-[80px]" : "max-w-[100px]")}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEdit(session.id, session.name);
            }}
          >
            {session.name}
            {!session.is_alive && " (dead)"}
          </span>
        )}
      </div>
      {/* Action menu - stop propagation to prevent tab click */}
      <div onClick={(e) => e.stopPropagation()}>
        <TabActionMenu
          tabType="adhoc"
          onReset={() => onReset(session.id)}
          onClose={() => onRemove(session.id)}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

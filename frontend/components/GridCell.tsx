"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { UnifiedTerminalHeader } from "./UnifiedTerminalHeader";
import {
  type TerminalSlot,
  getSlotSessionId,
  getSlotPanelId,
  getSlotWorkingDir,
} from "@/lib/utils/slot";

export interface GridCellProps {
  slot: TerminalSlot;
  cellIndex: number;
  fontFamily: string;
  fontSize: number;
  isDraggable?: boolean;
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  onModeChange?: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
}

/**
 * GridCell component for rendering a terminal in a grid layout with drag-and-drop.
 * Similar to SplitPane but designed for CSS Grid container with sortable support.
 */
export function GridCell({
  slot,
  cellIndex,
  fontFamily,
  fontSize,
  isDraggable = true,
  onTerminalRef,
  onStatusChange,
  onModeChange: _onModeChange,
}: GridCellProps) {
  const panelId = getSlotPanelId(slot);
  const sessionId = getSlotSessionId(slot);
  const workingDir = getSlotWorkingDir(slot);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: panelId,
    disabled: !isDraggable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 150ms ease, opacity 150ms ease, box-shadow 150ms ease",
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging
      ? "0 0 0 2px var(--term-accent), 0 8px 24px rgba(0, 0, 0, 0.4)"
      : "none",
    border: "1px solid var(--term-border)",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col h-full min-h-0 overflow-hidden rounded-md hover:border-[var(--term-border-active)] transition-colors"
      data-cell-index={cellIndex}
    >
      {/* Unified header */}
      <UnifiedTerminalHeader
        slot={slot}
        isDraggable={isDraggable}
        dragAttributes={attributes}
        dragListeners={listeners}
      />

      {/* Terminal content */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
        {sessionId ? (
          <>
            <TerminalComponent
              ref={(handle) => onTerminalRef?.(sessionId, handle)}
              sessionId={sessionId}
              workingDir={workingDir || undefined}
              className="h-full"
              fontFamily={fontFamily}
              fontSize={fontSize}
              onStatusChange={(status) => onStatusChange?.(sessionId, status)}
            />
            {/* Claude loading overlay */}
            {slot.type === "project" &&
              slot.activeMode === "claude" &&
              slot.claudeState !== "running" &&
              slot.claudeState !== "stopped" &&
              slot.claudeState !== "error" && <ClaudeLoadingOverlay variant="compact" />}
          </>
        ) : (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: "var(--term-text-muted)" }}
          >
            Click tab to start session
          </div>
        )}
      </div>
    </div>
  );
}

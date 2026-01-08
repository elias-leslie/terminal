"use client";

import { clsx } from "clsx";
import { Panel, Separator } from "react-resizable-panels";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { UnifiedTerminalHeader } from "./UnifiedTerminalHeader";
import { LayoutMode } from "./LayoutModeButton";
import {
  type TerminalSlot,
  getSlotSessionId,
  getSlotPanelId,
  getSlotWorkingDir,
} from "@/lib/utils/slot";

export interface SplitPaneProps {
  slot: TerminalSlot;
  layoutMode: LayoutMode;
  isLast: boolean;
  paneCount: number;
  fontFamily: string;
  fontSize: number;
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  // Action handlers for per-pane header buttons
  onSwitch?: (slot: TerminalSlot) => void;
  onSettings?: () => void;
  onReset?: (slot: TerminalSlot) => void;
  onClose?: (slot: TerminalSlot) => void;
  onUpload?: () => void;
  onClean?: (slot: TerminalSlot) => void;
  isMobile?: boolean;
}

/**
 * SplitPane component for rendering a terminal in a resizable panel.
 * Handles both project and ad-hoc terminal slots.
 */
export function SplitPane({
  slot,
  layoutMode,
  isLast,
  paneCount,
  fontFamily,
  fontSize,
  onTerminalRef,
  onStatusChange,
  onSwitch,
  onSettings,
  onReset,
  onClose,
  onUpload,
  onClean,
  isMobile,
}: SplitPaneProps) {
  const defaultSize = 100 / paneCount;
  const minSize = `${Math.max(10, 100 / (paneCount * 2))}%`;

  // Use slot utilities for discriminated union access
  const sessionId = getSlotSessionId(slot);
  const panelId = getSlotPanelId(slot);
  const workingDir = getSlotWorkingDir(slot);

  return (
    <>
      <Panel
        id={panelId}
        defaultSize={defaultSize}
        minSize={minSize}
        className="flex flex-col h-full min-h-0 overflow-hidden"
      >
        {/* Unified header */}
        <UnifiedTerminalHeader
          slot={slot}
          showCleanButton={slot.type === "project" && slot.activeMode === "claude"}
          onSwitch={onSwitch ? () => onSwitch(slot) : undefined}
          onSettings={onSettings}
          onReset={onReset ? () => onReset(slot) : undefined}
          onClose={onClose ? () => onClose(slot) : undefined}
          onUpload={onUpload}
          onClean={onClean ? () => onClean(slot) : undefined}
          isMobile={isMobile}
        />
        <div className="flex-1 min-h-0 overflow-hidden relative">
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
              {/* Claude loading overlay for split panes */}
              {slot.type === "project" &&
                slot.activeMode === "claude" &&
                slot.claudeState !== "running" &&
                slot.claudeState !== "stopped" &&
                slot.claudeState !== "error" && <ClaudeLoadingOverlay variant="compact" />}
            </>
          ) : (
            <div
              className="flex items-center justify-center h-full text-xs"
              style={{ color: "var(--term-text-muted)", backgroundColor: "var(--term-bg-deep)" }}
            >
              Click tab to start session
            </div>
          )}
        </div>
      </Panel>
      {!isLast && (
        <Separator
          className={clsx(
            layoutMode === "horizontal"
              ? "h-1 cursor-row-resize"
              : "w-1 cursor-col-resize",
            "transition-colors"
          )}
          style={{ backgroundColor: "var(--term-border)" }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--term-border-active)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--term-border)"; }}
        />
      )}
    </>
  );
}

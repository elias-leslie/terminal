"use client";

import { clsx } from "clsx";
import { Panel, Separator } from "react-resizable-panels";
import { Terminal as TerminalIcon } from "lucide-react";
import { TerminalComponent, TerminalHandle, ConnectionStatus } from "./Terminal";
import { ClaudeLoadingOverlay } from "./ClaudeLoadingOverlay";
import { ClaudeIndicator } from "./ClaudeIndicator";
import { TabModeDropdown } from "./TabModeDropdown";
import { LayoutMode } from "./LayoutModeButton";
import {
  type TerminalSlot,
  getSlotSessionId,
  getSlotPanelId,
  getSlotName,
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
  onModeChange?: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
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
  onModeChange,
}: SplitPaneProps) {
  const defaultSize = 100 / paneCount;
  const minSize = `${Math.max(10, 100 / (paneCount * 2))}%`;

  // Use slot utilities for discriminated union access
  const sessionId = getSlotSessionId(slot);
  const panelId = getSlotPanelId(slot);
  const name = getSlotName(slot);
  const workingDir = getSlotWorkingDir(slot);

  return (
    <>
      <Panel
        id={panelId}
        defaultSize={defaultSize}
        minSize={minSize}
        className="flex flex-col h-full min-h-0 overflow-hidden"
      >
        {/* Small header showing terminal name */}
        <div
          className="flex-shrink-0 flex items-center gap-1.5 px-2 py-0.5"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            borderBottom: "1px solid var(--term-border)",
          }}
        >
          {/* Mode indicator for projects */}
          {slot.type === "project" && (
            <ClaudeIndicator state={slot.activeMode === "claude" ? "idle" : "none"} />
          )}
          {slot.type === "adhoc" && (
            <TerminalIcon className="w-3 h-3" style={{ color: "var(--term-text-muted)" }} />
          )}
          <span className="text-xs truncate flex-1" style={{ color: "var(--term-text-muted)" }}>
            {name}
          </span>
          {/* Mode dropdown for project slots */}
          {slot.type === "project" && onModeChange && (
            <TabModeDropdown
              value={slot.activeMode}
              onChange={(mode) => onModeChange(
                slot.projectId,
                mode,
                slot.shellSessionId,
                slot.claudeSessionId,
                slot.rootPath
              )}
            />
          )}
          {!sessionId && (
            <span className="text-xs" style={{ color: "var(--term-text-muted)" }}>(no session)</span>
          )}
        </div>
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

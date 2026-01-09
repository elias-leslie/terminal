"use client";

import { clsx } from "clsx";
import { Panel, Separator } from "react-resizable-panels";
import {
  TerminalComponent,
  TerminalHandle,
  ConnectionStatus,
} from "./Terminal";
import { UnifiedTerminalHeader } from "./UnifiedTerminalHeader";
import { LayoutMode } from "./LayoutModeButton";
import {
  type TerminalSlot,
  getSlotSessionId,
  getSlotPanelId,
  getSlotWorkingDir,
} from "@/lib/utils/slot";
import { TerminalMode } from "./ModeToggle";

export interface SplitPaneProps {
  slot: TerminalSlot;
  layoutMode: LayoutMode;
  availableLayouts?: LayoutMode[];
  onLayout?: (mode: LayoutMode) => void;
  isLast: boolean;
  paneCount: number;
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  theme?: Parameters<typeof TerminalComponent>[0]["theme"];
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  // Action handlers for per-pane header buttons
  onSwitch?: (slot: TerminalSlot) => void;
  onSettings?: () => void;
  onReset?: (slot: TerminalSlot) => void;
  onClose?: (slot: TerminalSlot) => void;
  onUpload?: () => void;
  onClean?: (slot: TerminalSlot) => void;
  /** Opens terminal manager modal */
  onOpenModal?: () => void;
  /** Whether new panes can be added (at limit = false) */
  canAddPane?: boolean;
  /** Mode switch handler for project slots */
  onModeSwitch?: (
    slot: TerminalSlot,
    mode: TerminalMode,
  ) => void | Promise<void>;
  /** Whether mode switch is in progress */
  isModeSwitching?: boolean;
  isMobile?: boolean;
}

/**
 * SplitPane component for rendering a terminal in a resizable panel.
 * Handles both project and ad-hoc terminal slots.
 */
export function SplitPane({
  slot,
  layoutMode,
  availableLayouts,
  onLayout,
  isLast,
  paneCount,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  theme,
  onTerminalRef,
  onStatusChange,
  onSwitch,
  onSettings,
  onReset,
  onClose,
  onUpload,
  onClean,
  onOpenModal,
  canAddPane,
  onModeSwitch,
  isModeSwitching,
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
        {/* Per-pane header with full controls including layout selector */}
        <UnifiedTerminalHeader
          slot={slot}
          showCleanButton={
            slot.type === "project" && slot.activeMode === "claude"
          }
          showLayoutSelector={!isMobile && !!availableLayouts && !!onLayout}
          layoutMode={layoutMode}
          availableLayouts={availableLayouts}
          onLayout={onLayout}
          onSwitch={onSwitch ? () => onSwitch(slot) : undefined}
          onSettings={onSettings}
          onReset={onReset ? () => onReset(slot) : undefined}
          onClose={onClose ? () => onClose(slot) : undefined}
          onUpload={onUpload}
          onClean={onClean ? () => onClean(slot) : undefined}
          onOpenModal={onOpenModal}
          canAddPane={canAddPane}
          onModeSwitch={
            onModeSwitch ? (mode) => onModeSwitch(slot, mode) : undefined
          }
          isModeSwitching={isModeSwitching}
          isMobile={isMobile}
        />
        <div className="flex-1 min-h-0 overflow-hidden relative">
          {sessionId ? (
            <TerminalComponent
              ref={(handle) => onTerminalRef?.(sessionId, handle)}
              sessionId={sessionId}
              workingDir={workingDir || undefined}
              className="h-full"
              fontFamily={fontFamily}
              fontSize={fontSize}
              scrollback={scrollback}
              cursorStyle={cursorStyle}
              cursorBlink={cursorBlink}
              theme={theme}
              onStatusChange={(status) => onStatusChange?.(sessionId, status)}
            />
          ) : (
            <div
              className="flex items-center justify-center h-full text-xs"
              style={{
                color: "var(--term-text-muted)",
                backgroundColor: "var(--term-bg-deep)",
              }}
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
            "transition-colors",
          )}
          style={{ backgroundColor: "var(--term-border)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--term-border-active)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--term-border)";
          }}
        />
      )}
    </>
  );
}

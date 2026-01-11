"use client";

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

export interface GridCellProps {
  slot: TerminalSlot;
  cellIndex: number;
  layoutMode?: LayoutMode;
  availableLayouts?: LayoutMode[];
  onLayout?: (mode: LayoutMode) => void;
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  theme?: Parameters<typeof TerminalComponent>[0]["theme"];
  isDraggable?: boolean;
  onTerminalRef?: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange?: (sessionId: string, status: ConnectionStatus) => void;
  // Action handlers for per-cell header buttons
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
  /** All slots for swap dropdown */
  allSlots?: TerminalSlot[];
  /** Callback for swap dropdown selection */
  onSwapWith?: (otherSlotId: string) => void;
}

/**
 * GridCell component for rendering a terminal in a grid layout with drag-and-drop.
 * Similar to SplitPane but designed for CSS Grid container with sortable support.
 */
export function GridCell({
  slot,
  cellIndex,
  layoutMode,
  availableLayouts,
  onLayout,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  theme,
  isDraggable = true,
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
  allSlots,
  onSwapWith,
}: GridCellProps) {
  const sessionId = getSlotSessionId(slot);
  const workingDir = getSlotWorkingDir(slot);

  // Note: Drag-and-drop via dnd-kit has been removed.
  // This component will be replaced by ResizablePaneLayout in subtask 2.3.

  const style: React.CSSProperties = {
    border: "1px solid var(--term-border)",
  };

  return (
    <div
      style={style}
      className="flex flex-col h-full min-h-0 overflow-hidden rounded-md hover:border-[var(--term-border-active)] transition-colors"
      data-cell-index={cellIndex}
    >
      {/* Per-cell header with full controls */}
      <UnifiedTerminalHeader
        slot={slot}
        isDraggable={false}
        dragAttributes={{}}
        dragListeners={{}}
        showCleanButton={
          slot.type === "project" && slot.activeMode === "claude"
        }
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
        allSlots={allSlots}
        onSwapWith={onSwapWith}
      />

      {/* Terminal content */}
      <div
        className="flex-1 min-h-0 overflow-hidden relative"
        style={{ backgroundColor: "var(--term-bg-deep)" }}
      >
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
            style={{ color: "var(--term-text-muted)" }}
          >
            Click tab to start session
          </div>
        )}
      </div>
    </div>
  );
}

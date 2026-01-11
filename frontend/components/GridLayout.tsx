"use client";

import { useMemo } from "react";
import { clsx } from "clsx";
import { Plus, Settings, GripVertical } from "lucide-react";
import { GridCell } from "./GridCell";
import {
  TerminalComponent,
  TerminalHandle,
  ConnectionStatus,
} from "./Terminal";
import { LayoutModeButtons, LayoutMode } from "./LayoutModeButton";
import { GridLayoutMode, GRID_CELL_COUNTS } from "@/lib/constants/terminal";
import { type TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";
import { TerminalMode } from "./ModeToggle";

export interface GridLayoutProps {
  layoutMode: GridLayoutMode;
  availableLayouts?: LayoutMode[];
  onLayout?: (mode: LayoutMode) => void;
  slots: TerminalSlot[];
  orderedSlotIds: string[];
  onReorder: (newOrder: string[]) => void;
  fontFamily: string;
  fontSize: number;
  scrollback?: number;
  cursorStyle?: "block" | "underline" | "bar";
  cursorBlink?: boolean;
  theme?: Parameters<typeof TerminalComponent>[0]["theme"];
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
  onEmptyClick?: () => void;
  isMobile?: boolean;
  /** Swap two panes' positions (for dropdown swap) */
  onSwapPanes?: (slotIdA: string, slotIdB: string) => void;
}

/** Get grid dimensions based on layout mode (only 2x2 supported) */
function getGridDimensions(layoutMode: GridLayoutMode): number {
  // Only grid-2x2 supported - max 4 panes
  return 2;
}

/**
 * GridLayout container component with drag-and-drop support.
 * Renders terminals in a CSS Grid with sortable cells.
 */
export function GridLayout({
  layoutMode,
  availableLayouts,
  onLayout,
  slots,
  orderedSlotIds,
  onReorder,
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
  onEmptyClick,
  isMobile,
  onSwapPanes,
}: GridLayoutProps) {
  const gridSize = getGridDimensions(layoutMode);
  const maxCells = GRID_CELL_COUNTS[layoutMode];

  // Sort slots by orderedSlotIds, fill with unordered, cap at max
  const displaySlots = useMemo(() => {
    const slotMap = new Map(slots.map((s) => [getSlotPanelId(s), s]));

    // Start with slots in order
    const ordered: TerminalSlot[] = [];
    for (const id of orderedSlotIds) {
      const slot = slotMap.get(id);
      if (slot) {
        ordered.push(slot);
        slotMap.delete(id);
      }
    }

    // Add remaining unordered slots
    for (const slot of slotMap.values()) {
      ordered.push(slot);
    }

    // Cap at max cells
    return ordered.slice(0, maxCells);
  }, [slots, orderedSlotIds, maxCells]);

  // Calculate empty placeholder count
  const emptyCount = Math.max(0, maxCells - displaySlots.length);

  // Note: Drag-and-drop via dnd-kit has been removed.
  // This component will be replaced by ResizablePaneLayout in subtask 2.3.

  return (
    <div
      className="w-full h-full p-1 transition-all duration-200"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
        gridTemplateRows: `repeat(${gridSize}, 1fr)`,
        gap: "6px",
        backgroundColor: "var(--term-bg-deep)",
      }}
    >
      {/* Render grid cells */}
      {displaySlots.map((slot, index) => (
        <GridCell
          key={getSlotPanelId(slot)}
          slot={slot}
          cellIndex={index}
          layoutMode={layoutMode}
          availableLayouts={availableLayouts}
          onLayout={onLayout}
          fontFamily={fontFamily}
          fontSize={fontSize}
          scrollback={scrollback}
          cursorStyle={cursorStyle}
          cursorBlink={cursorBlink}
          theme={theme}
          isDraggable={displaySlots.length > 1}
          onTerminalRef={onTerminalRef}
          onStatusChange={onStatusChange}
          onSwitch={onSwitch}
          onSettings={onSettings}
          onReset={onReset}
          onClose={onClose}
          onUpload={onUpload}
          onClean={onClean}
          onOpenModal={onOpenModal}
          canAddPane={canAddPane}
          onModeSwitch={onModeSwitch}
          isModeSwitching={isModeSwitching}
          isMobile={isMobile}
          allSlots={displaySlots}
          onSwapWith={
            onSwapPanes
              ? (otherSlotId) => onSwapPanes(getSlotPanelId(slot), otherSlotId)
              : undefined
          }
        />
      ))}

      {/* Empty placeholders with header and add button */}
      {Array.from({ length: emptyCount }).map((_, index) => (
        <div
          key={`empty-${index}`}
          className="flex flex-col h-full min-h-0 overflow-hidden rounded-md transition-colors"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            border: "1px dashed var(--term-border)",
          }}
        >
          {/* Header for empty cell */}
          <div
            className={clsx(
              "flex-shrink-0 flex items-center gap-1",
              isMobile ? "h-9 px-1.5" : "h-8 px-2",
            )}
            style={{
              backgroundColor: "var(--term-bg-surface)",
              borderBottom: "1px solid var(--term-border)",
            }}
          >
            {/* Placeholder drag handle (inactive) */}
            <div className="p-0.5 opacity-30">
              <GripVertical
                className="w-3.5 h-3.5"
                style={{ color: "var(--term-text-muted)" }}
              />
            </div>

            {/* Empty slot label */}
            <span
              className="text-xs px-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Empty
            </span>

            {/* Add terminal button */}
            {onOpenModal && (
              <button
                onClick={onOpenModal}
                disabled={!canAddPane}
                className={clsx(
                  "flex items-center justify-center rounded ml-1 transition-all duration-150",
                  isMobile ? "w-7 h-7" : "w-5 h-5",
                  !canAddPane && "opacity-50 cursor-not-allowed",
                )}
                style={{
                  backgroundColor: "var(--term-bg-surface)",
                  border: "1px solid var(--term-border)",
                  color: "var(--term-text-muted)",
                }}
                onMouseEnter={(e) => {
                  if (canAddPane) {
                    e.currentTarget.style.backgroundColor =
                      "var(--term-bg-elevated)";
                    e.currentTarget.style.borderColor = "var(--term-accent)";
                    e.currentTarget.style.color = "var(--term-accent)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--term-bg-surface)";
                  e.currentTarget.style.borderColor = "var(--term-border)";
                  e.currentTarget.style.color = "var(--term-text-muted)";
                }}
                title={
                  canAddPane
                    ? "Open terminal"
                    : "Maximum 4 terminals. Close one to add more."
                }
                aria-label={
                  canAddPane
                    ? "Open terminal"
                    : "Maximum 4 terminals. Close one to add more."
                }
              >
                <Plus className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Layout selector */}
            {!isMobile && availableLayouts && onLayout && (
              <div className="flex items-center gap-0.5 mr-1">
                <LayoutModeButtons
                  layoutMode={layoutMode}
                  onLayoutChange={onLayout}
                  availableLayouts={availableLayouts}
                />
              </div>
            )}

            {/* Settings button */}
            {onSettings && (
              <button
                onClick={onSettings}
                className={clsx(
                  "flex items-center justify-center rounded transition-all duration-150",
                  isMobile ? "w-8 h-8" : "w-6 h-6",
                )}
                style={{ color: "var(--term-text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor =
                    "var(--term-bg-elevated)";
                  e.currentTarget.style.color = "var(--term-accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--term-text-muted)";
                }}
                title="Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Empty content area with click to add */}
          <div
            onClick={onEmptyClick}
            className="flex-1 flex flex-col items-center justify-center gap-2 cursor-pointer group"
            style={{ backgroundColor: "var(--term-bg-deep)" }}
          >
            <div
              className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 group-hover:scale-110"
              style={{
                backgroundColor: "var(--term-bg-elevated)",
                border: "1px solid var(--term-border)",
              }}
            >
              <span
                className="text-lg font-light transition-colors group-hover:text-[var(--term-accent)]"
                style={{ color: "var(--term-text-muted)" }}
              >
                +
              </span>
            </div>
            <span
              className="text-xs transition-colors group-hover:text-[var(--term-text-primary)]"
              style={{ color: "var(--term-text-muted)" }}
            >
              Add terminal
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

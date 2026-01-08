"use client";

import { useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { GridCell } from "./GridCell";
import {
  TerminalComponent,
  TerminalHandle,
  ConnectionStatus,
} from "./Terminal";
import { GridLayoutMode, GRID_CELL_COUNTS } from "@/lib/constants/terminal";
import { LayoutMode } from "./LayoutModeButton";
import { type TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";

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
  onNewShell?: (slot: TerminalSlot) => void;
  onNewClaude?: (slot: TerminalSlot) => void;
  onEmptyClick?: () => void;
  isMobile?: boolean;
}

/** Get grid dimensions based on layout mode */
function getGridDimensions(layoutMode: GridLayoutMode): number {
  switch (layoutMode) {
    case "grid-2x2":
      return 2;
    case "grid-3x3":
      return 3;
    case "grid-4x4":
      return 4;
  }
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
  onNewShell,
  onNewClaude,
  onEmptyClick,
  isMobile,
}: GridLayoutProps) {
  const gridSize = getGridDimensions(layoutMode);
  const maxCells = GRID_CELL_COUNTS[layoutMode];

  // Configure dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activating
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  // Get IDs for sortable context
  const sortableIds = useMemo(
    () => displaySlots.map(getSlotPanelId),
    [displaySlots],
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortableIds.indexOf(active.id as string);
        const newIndex = sortableIds.indexOf(over.id as string);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(sortableIds, oldIndex, newIndex);
          onReorder(newOrder);
        }
      }
    },
    [sortableIds, onReorder],
  );

  // Calculate empty placeholder count
  const emptyCount = Math.max(0, maxCells - displaySlots.length);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
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
              onNewShell={onNewShell}
              onNewClaude={onNewClaude}
              isMobile={isMobile}
            />
          ))}

          {/* Empty placeholders with improved affordance */}
          {Array.from({ length: emptyCount }).map((_, index) => (
            <div
              key={`empty-${index}`}
              onClick={onEmptyClick}
              className="group flex flex-col items-center justify-center gap-2 rounded-md cursor-pointer transition-all duration-150 hover:border-[var(--term-accent)]"
              style={{
                backgroundColor: "var(--term-bg-surface)",
                border: "1px dashed var(--term-border)",
              }}
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
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

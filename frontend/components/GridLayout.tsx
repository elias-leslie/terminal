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
import { TerminalHandle, ConnectionStatus } from "./Terminal";
import { GridLayoutMode, GRID_CELL_COUNTS } from "@/lib/constants/terminal";
import { type TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";

export interface GridLayoutProps {
  layoutMode: GridLayoutMode;
  slots: TerminalSlot[];
  orderedSlotIds: string[];
  onReorder: (newOrder: string[]) => void;
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
  slots,
  orderedSlotIds,
  onReorder,
  fontFamily,
  fontSize,
  onTerminalRef,
  onStatusChange,
  onModeChange,
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
    })
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
    [displaySlots]
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
    [sortableIds, onReorder]
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
          className="w-full h-full p-1"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
            gridTemplateRows: `repeat(${gridSize}, 1fr)`,
            gap: "4px",
            backgroundColor: "var(--term-bg-deep)",
          }}
        >
          {/* Render grid cells */}
          {displaySlots.map((slot, index) => (
            <GridCell
              key={getSlotPanelId(slot)}
              slot={slot}
              cellIndex={index}
              fontFamily={fontFamily}
              fontSize={fontSize}
              isDraggable={displaySlots.length > 1}
              onTerminalRef={onTerminalRef}
              onStatusChange={onStatusChange}
              onModeChange={onModeChange}
            />
          ))}

          {/* Empty placeholders */}
          {Array.from({ length: emptyCount }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="flex items-center justify-center rounded-md"
              style={{
                backgroundColor: "var(--term-bg-surface)",
                border: "1px dashed var(--term-border)",
                color: "var(--term-text-muted)",
              }}
            >
              <span className="text-xs">Empty</span>
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

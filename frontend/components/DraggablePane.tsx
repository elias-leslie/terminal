"use client";

import { usePaneDragDrop } from "@/lib/hooks/use-pane-drag-drop";
import { clsx } from "clsx";

export interface DraggablePaneProps {
  panelId: string;
  onSwap: (sourceId: string, targetId: string) => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrapper component that makes a pane draggable for reordering.
 * Shows drop zone indicator when another pane is dragged over.
 */
export function DraggablePane({
  panelId,
  onSwap,
  children,
  className,
}: DraggablePaneProps) {
  const { isDragging, isDropTarget, dragHandleProps, dropZoneProps } =
    usePaneDragDrop({
      panelId,
      onSwap,
    });

  return (
    <div
      className={clsx("relative h-full", isDragging && "opacity-50", className)}
      {...dropZoneProps}
    >
      {/* Drop zone indicator overlay */}
      {isDropTarget && (
        <div
          className="absolute inset-0 z-10 pointer-events-none rounded-md"
          style={{
            border: "2px dashed var(--term-accent)",
            backgroundColor: "var(--term-accent-glow)",
          }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: "var(--term-accent)" }}
          >
            <span className="text-sm font-medium px-3 py-1 rounded-md bg-[var(--term-bg-elevated)]">
              Drop to swap
            </span>
          </div>
        </div>
      )}

      {/* Pane content with drag handle context */}
      <DragHandleContext.Provider value={dragHandleProps}>
        {children}
      </DragHandleContext.Provider>
    </div>
  );
}

// Context to pass drag handle props down to the header
import { createContext, useContext, DragEvent } from "react";

interface DragHandleContextValue {
  draggable: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: (e: DragEvent) => void;
}

const DragHandleContext = createContext<DragHandleContextValue | null>(null);

/**
 * Hook to get drag handle props from the DraggablePane parent.
 */
export function useDragHandle() {
  return useContext(DragHandleContext);
}

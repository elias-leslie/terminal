import { useState, useCallback, useRef, DragEvent } from "react";

export interface UsePaneDragDropOptions {
  panelId: string;
  onSwap: (sourceId: string, targetId: string) => void;
}

export interface UsePaneDragDropResult {
  isDragging: boolean;
  isDropTarget: boolean;
  dragHandleProps: {
    draggable: boolean;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: (e: DragEvent) => void;
  };
  dropZoneProps: {
    onDragOver: (e: DragEvent) => void;
    onDragEnter: (e: DragEvent) => void;
    onDragLeave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
}

// Data transfer type for pane drag
const DRAG_TYPE = "application/x-terminal-pane";

/**
 * Hook for handling native HTML5 drag-drop for pane reordering.
 */
export function usePaneDragDrop({
  panelId,
  onSwap,
}: UsePaneDragDropOptions): UsePaneDragDropResult {
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.setData(DRAG_TYPE, panelId);
      e.dataTransfer.effectAllowed = "move";
      setIsDragging(true);

      // Add a delay to allow the drag image to be captured
      requestAnimationFrame(() => {
        // Set a custom drag image (optional - default works fine)
      });
    },
    [panelId],
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setIsDropTarget(false);
    dragCountRef.current = 0;
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    // Only allow drop if it's a pane drag
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
      e.preventDefault();
      dragCountRef.current++;
      if (dragCountRef.current === 1) {
        // Get source panel ID to check if different from target
        // We can't access the data during dragenter, so we just show the indicator
        setIsDropTarget(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDropTarget(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const sourceId = e.dataTransfer.getData(DRAG_TYPE);

      // Don't swap with self
      if (sourceId && sourceId !== panelId) {
        onSwap(sourceId, panelId);
      }

      setIsDropTarget(false);
      dragCountRef.current = 0;
    },
    [panelId, onSwap],
  );

  return {
    isDragging,
    isDropTarget,
    dragHandleProps: {
      draggable: true,
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
    dropZoneProps: {
      onDragOver: handleDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}

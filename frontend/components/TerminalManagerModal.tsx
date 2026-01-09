"use client";

import { useState, useLayoutEffect } from "react";
import { X, Plus, Terminal } from "lucide-react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  useProjectSettings,
  ProjectSetting,
} from "@/lib/hooks/use-project-settings";
import { useHoverStyle } from "@/lib/hooks/use-hover-style";
import { SortableProjectRow } from "./SortableProjectRow";

interface TerminalManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGenericTerminal: () => void;
}

/**
 * Terminal Manager Modal - opened via + button in tab bar.
 * Features:
 * - Enable/disable project terminals via checkboxes
 * - Drag-and-drop reordering of projects
 * - "New Generic Terminal" button for ad-hoc sessions
 */
export function TerminalManagerModal({
  isOpen,
  onClose,
  onCreateGenericTerminal,
}: TerminalManagerModalProps) {
  const { projects, updateSettings, updateOrder, isUpdating } =
    useProjectSettings();
  const [localProjects, setLocalProjects] = useState<ProjectSetting[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Hover styles for close button
  const closeButtonHover = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-text-primary)",
    defaultColor: "var(--term-text-muted)",
  });

  // Hover styles for "New Generic Terminal" button
  const newTerminalHover = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-accent)",
    defaultColor: "var(--term-text-muted)",
  });

  // Hover styles for Cancel button
  const cancelButtonHover = useHoverStyle({
    defaultBorderColor: "var(--term-border)",
    hoverBorderColor: "var(--term-border-active)",
    hoverColor: "var(--term-text-primary)",
    defaultColor: "var(--term-text-muted)",
  });

  // Sync local state with server state
  useLayoutEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: sync local copy with props when modal opens
      setLocalProjects([...projects]);
      setHasChanges(false);
    }
  }, [isOpen, projects]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalProjects((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
    setHasChanges(true);
  };

  // Toggle project enabled
  const handleToggle = (projectId: string) => {
    setLocalProjects((items) =>
      items.map((item) =>
        item.id === projectId
          ? { ...item, terminal_enabled: !item.terminal_enabled }
          : item,
      ),
    );
    setHasChanges(true);
  };

  // Apply changes - batch updates for parallel execution
  const handleApply = async () => {
    // Collect all settings updates into an array
    const settingsUpdates = localProjects
      .filter((local) => {
        const original = projects.find((p) => p.id === local.id);
        return original && local.terminal_enabled !== original.terminal_enabled;
      })
      .map((local) =>
        updateSettings(local.id, { enabled: local.terminal_enabled }),
      );

    // Check if order changed
    const originalOrder = projects.map((p) => p.id);
    const newOrder = localProjects.map((p) => p.id);
    const orderChanged =
      originalOrder.length !== newOrder.length ||
      originalOrder.some((id, idx) => id !== newOrder[idx]);

    // Execute all updates in parallel
    await Promise.all([
      ...settingsUpdates,
      ...(orderChanged ? [updateOrder(newOrder)] : []),
    ]);

    setHasChanges(false);
    onClose();
  };

  // Handle creating generic terminal
  const handleCreateGeneric = () => {
    onCreateGenericTerminal();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay - z-10000 to escape parent stacking contexts */}
      <div
        className="fixed inset-0 z-[10000]"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />

      {/* Modal - z-10001 above overlay */}
      <div
        className="fixed z-[10001] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[480px] rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: "var(--term-bg-elevated)",
          border: "1px solid var(--term-border-active)",
          boxShadow: "0 8px 48px rgba(0, 0, 0, 0.6)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--term-border)" }}
        >
          <h2
            className="text-xs font-medium tracking-widest"
            style={{
              color: "var(--term-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            TERMINALS
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded transition-colors"
            onMouseEnter={closeButtonHover.onMouseEnter}
            onMouseLeave={closeButtonHover.onMouseLeave}
            style={closeButtonHover.style}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 max-h-[400px] overflow-y-auto">
          {/* Projects section */}
          {localProjects.length > 0 && (
            <>
              <div
                className="text-xs font-medium mb-2 px-2"
                style={{
                  color: "var(--term-text-muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                PROJECTS
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={localProjects.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {localProjects.map((project) => (
                    <SortableProjectRow
                      key={project.id}
                      project={project}
                      onToggle={() => handleToggle(project.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </>
          )}

          {localProjects.length === 0 && (
            <p
              className="text-sm text-center py-4"
              style={{ color: "var(--term-text-muted)" }}
            >
              No projects found
            </p>
          )}

          {/* New Generic Terminal button */}
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid var(--term-border)" }}
          >
            <button
              onClick={handleCreateGeneric}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md transition-colors"
              style={{
                ...newTerminalHover.style,
                fontFamily: "var(--font-mono)",
              }}
              onMouseEnter={newTerminalHover.onMouseEnter}
              onMouseLeave={newTerminalHover.onMouseLeave}
            >
              <Plus size={16} style={{ color: "var(--term-accent)" }} />
              <Terminal size={16} />
              <span className="text-sm">New Generic Terminal</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-5 py-4"
          style={{ borderTop: "1px solid var(--term-border)" }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded transition-colors"
            style={{
              backgroundColor: "transparent",
              border: `1px solid ${cancelButtonHover.style.borderColor || "var(--term-border)"}`,
              color: cancelButtonHover.style.color,
              fontFamily: "var(--font-mono)",
            }}
            onMouseEnter={cancelButtonHover.onMouseEnter}
            onMouseLeave={cancelButtonHover.onMouseLeave}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges || isUpdating}
            className="px-4 py-2 text-sm font-medium rounded transition-all"
            style={{
              backgroundColor: hasChanges
                ? "var(--term-accent)"
                : "var(--term-bg-surface)",
              border: `1px solid ${hasChanges ? "var(--term-accent)" : "var(--term-border)"}`,
              color: hasChanges
                ? "var(--term-bg-deep)"
                : "var(--term-text-muted)",
              fontFamily: "var(--font-mono)",
              opacity: isUpdating ? 0.5 : 1,
              boxShadow: hasChanges
                ? "0 0 12px rgba(0, 255, 159, 0.3)"
                : "none",
            }}
          >
            {isUpdating ? "Saving..." : "Apply"}
          </button>
        </div>
      </div>
    </>
  );
}

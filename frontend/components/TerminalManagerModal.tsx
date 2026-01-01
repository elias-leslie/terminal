"use client";

import { useState, useEffect } from "react";
import { X, GripVertical, Plus, Terminal } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useProjectSettings, ProjectSetting } from "@/lib/hooks/use-project-settings";
import { useHoverStyle } from "@/lib/hooks/use-hover-style";

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
  const { projects, updateSettings, updateOrder, isUpdating } = useProjectSettings();
  const [localProjects, setLocalProjects] = useState<ProjectSetting[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Hover styles for close button
  const closeButtonHover = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-text-primary)",
    defaultColor: "var(--term-text-muted)",
  });

  // Sync local state with server state
  useEffect(() => {
    if (isOpen) {
      setLocalProjects([...projects]);
      setHasChanges(false);
    }
  }, [isOpen, projects]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
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
        item.id === projectId ? { ...item, terminal_enabled: !item.terminal_enabled } : item
      )
    );
    setHasChanges(true);
  };

  // Apply changes
  const handleApply = async () => {
    // Update each changed project
    for (const local of localProjects) {
      const original = projects.find((p) => p.id === local.id);
      if (!original) continue;

      if (local.terminal_enabled !== original.terminal_enabled) {
        await updateSettings(local.id, { enabled: local.terminal_enabled });
      }
    }

    // Update order if it changed
    const originalOrder = projects.map((p) => p.id);
    const newOrder = localProjects.map((p) => p.id);
    if (JSON.stringify(originalOrder) !== JSON.stringify(newOrder)) {
      await updateOrder(newOrder);
    }

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
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-[9999] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[480px] rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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
            style={{ color: "var(--term-text-muted)", fontFamily: "var(--font-mono)" }}
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
                style={{ color: "var(--term-text-muted)", fontFamily: "var(--font-mono)" }}
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
          <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--term-border)" }}>
            <button
              onClick={handleCreateGeneric}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md transition-colors"
              style={{
                backgroundColor: "transparent",
                color: "var(--term-text-muted)",
                fontFamily: "var(--font-mono)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
                e.currentTarget.style.color = "var(--term-accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--term-text-muted)";
              }}
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
              border: "1px solid var(--term-border)",
              color: "var(--term-text-muted)",
              fontFamily: "var(--font-mono)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--term-border-active)";
              e.currentTarget.style.color = "var(--term-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--term-border)";
              e.currentTarget.style.color = "var(--term-text-muted)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!hasChanges || isUpdating}
            className="px-4 py-2 text-sm font-medium rounded transition-all"
            style={{
              backgroundColor: hasChanges ? "var(--term-accent)" : "var(--term-bg-surface)",
              border: `1px solid ${hasChanges ? "var(--term-accent)" : "var(--term-border)"}`,
              color: hasChanges ? "var(--term-bg-deep)" : "var(--term-text-muted)",
              fontFamily: "var(--font-mono)",
              opacity: isUpdating ? 0.5 : 1,
              boxShadow: hasChanges ? "0 0 12px rgba(0, 255, 159, 0.3)" : "none",
            }}
          >
            {isUpdating ? "Saving..." : "Apply"}
          </button>
        </div>
      </div>
    </>
  );
}

// Sortable project row (simplified - no mode dropdown)
function SortableProjectRow({
  project,
  onToggle,
}: {
  project: ProjectSetting;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-2 py-2.5 rounded"
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {/* Drag handle */}
      <button
        className="flex items-center justify-center w-5 h-5 cursor-grab opacity-50 hover:opacity-100"
        style={{ color: "var(--term-text-muted)" }}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>

      {/* Checkbox */}
      <label className="relative flex cursor-pointer">
        <input
          type="checkbox"
          checked={project.terminal_enabled}
          onChange={onToggle}
          className="absolute opacity-0 cursor-pointer"
        />
        <span
          className="w-4 h-4 rounded flex items-center justify-center text-xs transition-colors"
          style={{
            backgroundColor: project.terminal_enabled
              ? "var(--term-accent)"
              : "var(--term-bg-deep)",
            border: `1px solid ${
              project.terminal_enabled ? "var(--term-accent)" : "var(--term-border-active)"
            }`,
            color: "var(--term-bg-deep)",
          }}
        >
          {project.terminal_enabled && "✓"}
        </span>
      </label>

      {/* Project name */}
      <span
        className="flex-1 text-sm"
        style={{
          color: project.terminal_enabled
            ? "var(--term-text-primary)"
            : "var(--term-text-muted)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {project.name}
      </span>
    </div>
  );
}

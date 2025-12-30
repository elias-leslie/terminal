"use client";

import { useState, useEffect, useCallback } from "react";
import { X, GripVertical, ChevronDown } from "lucide-react";
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

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectSettingsModal({ isOpen, onClose }: ProjectSettingsModalProps) {
  const { projects, updateSettings, updateOrder, isUpdating } = useProjectSettings();
  const [localProjects, setLocalProjects] = useState<ProjectSetting[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

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

  // Set project mode
  const handleModeChange = (projectId: string, mode: "shell" | "claude") => {
    setLocalProjects((items) =>
      items.map((item) =>
        item.id === projectId ? { ...item, terminal_mode: mode } : item
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

      const changes: { enabled?: boolean; default_mode?: "shell" | "claude" } = {};
      if (local.terminal_enabled !== original.terminal_enabled) {
        changes.enabled = local.terminal_enabled;
      }
      if (local.terminal_mode !== original.terminal_mode) {
        changes.default_mode = local.terminal_mode;
      }

      if (Object.keys(changes).length > 0) {
        await updateSettings(local.id, changes);
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
            TERMINAL PROJECTS
          </h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded transition-colors"
            style={{ color: "var(--term-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
              e.currentTarget.style.color = "var(--term-text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--term-text-muted)";
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-3 max-h-[400px] overflow-y-auto">
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
                  onModeChange={(mode) => handleModeChange(project.id, mode)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {localProjects.length === 0 && (
            <p
              className="text-sm text-center py-8"
              style={{ color: "var(--term-text-muted)" }}
            >
              No projects found
            </p>
          )}
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

// Sortable project row
function SortableProjectRow({
  project,
  onToggle,
  onModeChange,
}: {
  project: ProjectSetting;
  onToggle: () => void;
  onModeChange: (mode: "shell" | "claude") => void;
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

      {/* Mode dropdown */}
      <ModeDropdown
        value={project.terminal_mode}
        onChange={onModeChange}
        disabled={!project.terminal_enabled}
      />
    </div>
  );
}

// Mode dropdown
function ModeDropdown({
  value,
  onChange,
  disabled,
}: {
  value: "shell" | "claude";
  onChange: (v: "shell" | "claude") => void;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded transition-colors"
        style={{
          backgroundColor: "var(--term-bg-deep)",
          border: "1px solid var(--term-border)",
          color: disabled ? "var(--term-text-muted)" : "var(--term-text-primary)",
          fontFamily: "var(--font-mono)",
          minWidth: "80px",
          justifyContent: "space-between",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.borderColor = "var(--term-border-active)";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.borderColor = "var(--term-border)";
        }}
      >
        <span>{value === "claude" ? "Claude" : "Shell"}</span>
        <ChevronDown size={12} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div
            className="absolute top-full right-0 mt-1 min-w-full z-11 rounded overflow-hidden"
            style={{
              backgroundColor: "var(--term-bg-elevated)",
              border: "1px solid var(--term-border-active)",
            }}
          >
            <button
              className="block w-full px-2.5 py-2 text-xs text-left transition-colors"
              style={{
                color: value === "shell" ? "var(--term-accent)" : "var(--term-text-primary)",
                fontFamily: "var(--font-mono)",
              }}
              onClick={() => {
                onChange("shell");
                setIsOpen(false);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Shell
            </button>
            <button
              className="block w-full px-2.5 py-2 text-xs text-left transition-colors"
              style={{
                color: value === "claude" ? "var(--term-accent)" : "var(--term-text-primary)",
                fontFamily: "var(--font-mono)",
              }}
              onClick={() => {
                onChange("claude");
                setIsOpen(false);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              Claude
            </button>
          </div>
        </>
      )}
    </div>
  );
}

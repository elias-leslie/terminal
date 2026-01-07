"use client";

import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import { useHoverStyle } from "@/lib/hooks/use-hover-style";
import { ProjectSetting } from "@/lib/hooks/use-project-settings";

interface SortableProjectRowProps {
  project: ProjectSetting;
  onToggle: () => void;
}

export function SortableProjectRow({ project, onToggle }: SortableProjectRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  const rowHover = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...rowHover.style,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-2 py-2.5 rounded"
      onMouseEnter={rowHover.onMouseEnter}
      onMouseLeave={rowHover.onMouseLeave}
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

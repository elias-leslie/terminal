"use client";

import { useMemo } from "react";
import { X, Plus, Terminal, Folder } from "lucide-react";
import {
  useProjectSettings,
  ProjectSetting,
} from "@/lib/hooks/use-project-settings";
import { useHoverStyle } from "@/lib/hooks/use-hover-style";
import { TerminalSession } from "@/lib/hooks/use-terminal-sessions";

interface TerminalManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGenericTerminal: () => void;
  onCreateProjectTerminal: (projectId: string) => void;
  sessions: TerminalSession[];
}

interface ProjectButtonProps {
  project: ProjectSetting;
  sessionCount: number;
  onClick: () => void;
}

function ProjectButton({ project, sessionCount, onClick }: ProjectButtonProps) {
  const hoverStyle = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-text-primary)",
    defaultColor: "var(--term-text-secondary)",
  });

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md transition-colors text-left"
      style={{
        ...hoverStyle.style,
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={hoverStyle.onMouseEnter}
      onMouseLeave={hoverStyle.onMouseLeave}
    >
      <Folder
        size={16}
        style={{ color: "var(--term-accent)", flexShrink: 0 }}
      />
      <span className="flex-1 text-sm truncate">{project.name}</span>
      {sessionCount > 0 && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            color: "var(--term-text-muted)",
          }}
        >
          {sessionCount} open
        </span>
      )}
      <Plus
        size={14}
        style={{ color: "var(--term-text-muted)", flexShrink: 0 }}
      />
    </button>
  );
}

interface GenericTerminalButtonProps {
  sessionCount: number;
  onClick: () => void;
}

function GenericTerminalButton({
  sessionCount,
  onClick,
}: GenericTerminalButtonProps) {
  const hoverStyle = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-accent)",
    defaultColor: "var(--term-text-muted)",
  });

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md transition-colors"
      style={{
        ...hoverStyle.style,
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={hoverStyle.onMouseEnter}
      onMouseLeave={hoverStyle.onMouseLeave}
    >
      <Terminal
        size={16}
        style={{ color: "var(--term-accent)", flexShrink: 0 }}
      />
      <span className="flex-1 text-sm text-left">New Terminal</span>
      {sessionCount > 0 && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--term-bg-surface)",
            color: "var(--term-text-muted)",
          }}
        >
          {sessionCount} open
        </span>
      )}
      <Plus
        size={14}
        style={{ color: "var(--term-text-muted)", flexShrink: 0 }}
      />
    </button>
  );
}

/**
 * Terminal Manager Modal - opened via + button in tab bar.
 * Simple project selector - click a project to create a new terminal for it.
 */
export function TerminalManagerModal({
  isOpen,
  onClose,
  onCreateGenericTerminal,
  onCreateProjectTerminal,
  sessions,
}: TerminalManagerModalProps) {
  const { projects } = useProjectSettings();

  // Count sessions per project
  const sessionCountByProject = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const session of sessions) {
      if (session.project_id) {
        counts[session.project_id] = (counts[session.project_id] || 0) + 1;
      }
    }
    return counts;
  }, [sessions]);

  // Count generic sessions (no project_id)
  const genericSessionCount = useMemo(() => {
    return sessions.filter((s) => !s.project_id).length;
  }, [sessions]);

  // Hover styles for close button
  const closeButtonHover = useHoverStyle({
    hoverBg: "var(--term-bg-surface)",
    defaultBg: "transparent",
    hoverColor: "var(--term-text-primary)",
    defaultColor: "var(--term-text-muted)",
  });

  // Handle clicking a project - create new terminal for it
  const handleProjectClick = (project: ProjectSetting) => {
    onCreateProjectTerminal(project.id);
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
          {projects.length > 0 && (
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
              <div className="space-y-1">
                {projects.map((project) => (
                  <ProjectButton
                    key={project.id}
                    project={project}
                    sessionCount={sessionCountByProject[project.id] || 0}
                    onClick={() => handleProjectClick(project)}
                  />
                ))}
              </div>
            </>
          )}

          {projects.length === 0 && (
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
            <GenericTerminalButton
              sessionCount={genericSessionCount}
              onClick={handleCreateGeneric}
            />
          </div>
        </div>
      </div>
    </>
  );
}

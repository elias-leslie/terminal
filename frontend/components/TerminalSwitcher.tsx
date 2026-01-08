"use client";

import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { ChevronDown, Plus, Terminal as TerminalIcon, Sparkles } from "lucide-react";
import { ClaudeIndicator } from "./ClaudeIndicator";
import type { ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import type { TerminalSession } from "@/lib/hooks/use-terminal-sessions";

export interface TerminalSwitcherProps {
  currentName: string;
  currentMode?: "shell" | "claude";
  currentProjectId?: string | null;
  projectTerminals: ProjectTerminal[];
  adHocSessions: TerminalSession[];
  onSelectProject: (projectId: string) => void;
  onSelectAdHoc: (sessionId: string) => void;
  onNewTerminal: () => void;
  onNewTerminalForProject?: (projectId: string, mode: "shell" | "claude") => void;
  isMobile?: boolean;
}

export function TerminalSwitcher({
  currentName,
  currentMode,
  currentProjectId,
  projectTerminals,
  adHocSessions,
  onSelectProject,
  onSelectAdHoc,
  onNewTerminal,
  onNewTerminalForProject,
  isMobile = false,
}: TerminalSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // projectTerminals is already filtered to enabled projects
  const enabledProjects = projectTerminals;

  // Quick spawn handlers
  const handleQuickSpawnShell = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentProjectId && onNewTerminalForProject) {
      onNewTerminalForProject(currentProjectId, "shell");
    }
  };

  const handleQuickSpawnClaude = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentProjectId && onNewTerminalForProject) {
      onNewTerminalForProject(currentProjectId, "claude");
    }
  };

  return (
    <div ref={dropdownRef} className="relative flex items-center gap-1">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate max-w-[140px] transition-all duration-150",
          "hover:bg-[var(--term-bg-elevated)]"
        )}
        style={{
          color: "var(--term-text-primary)",
        }}
        title={currentName}
      >
        {currentMode === "claude" ? (
          <ClaudeIndicator state="idle" />
        ) : (
          <TerminalIcon className="w-3 h-3 flex-shrink-0" style={{ color: "var(--term-text-muted)" }} />
        )}
        <span className="truncate">{currentName}</span>
        <ChevronDown className={clsx("w-3 h-3 flex-shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* Quick Spawn Buttons - visible when viewing a project */}
      {currentProjectId && onNewTerminalForProject && (
        <div
          className="flex items-center rounded overflow-hidden"
          style={{
            border: "1px solid var(--term-border)",
            backgroundColor: "var(--term-bg-surface)",
          }}
        >
          {/* New Shell button */}
          <button
            onClick={handleQuickSpawnShell}
            className={clsx(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-all duration-150",
              "hover:bg-[var(--term-bg-elevated)]"
            )}
            style={{ color: "var(--term-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--term-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--term-text-muted)";
            }}
            title="New Shell for this project"
          >
            <Plus className="w-2.5 h-2.5" />
            <TerminalIcon className="w-3 h-3" />
          </button>

          {/* Divider */}
          <div
            className="w-px h-4"
            style={{ backgroundColor: "var(--term-border)" }}
          />

          {/* New Claude button */}
          <button
            onClick={handleQuickSpawnClaude}
            className={clsx(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] transition-all duration-150",
              "hover:bg-[var(--term-bg-elevated)]"
            )}
            style={{ color: "var(--term-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--term-accent)";
              e.currentTarget.style.textShadow = "0 0 8px var(--term-accent-glow)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--term-text-muted)";
              e.currentTarget.style.textShadow = "none";
            }}
            title="New Claude for this project"
          >
            <Plus className="w-2.5 h-2.5" />
            <Sparkles className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            "absolute left-0 mt-1 z-50 rounded-md shadow-lg overflow-hidden",
            isMobile ? "min-w-[200px]" : "min-w-[180px]"
          )}
          style={{
            backgroundColor: "var(--term-bg-elevated)",
            border: "1px solid var(--term-border)",
          }}
        >
          {/* Projects section */}
          {enabledProjects.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{ color: "var(--term-text-muted)", backgroundColor: "var(--term-bg-surface)" }}
              >
                Projects
              </div>
              {enabledProjects.map((pt) => (
                <button
                  key={pt.projectId}
                  onClick={() => {
                    onSelectProject(pt.projectId);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                  style={{ color: "var(--term-text-primary)" }}
                >
                  <ClaudeIndicator state={pt.activeMode === "claude" ? "idle" : "none"} />
                  <span className="truncate flex-1">{pt.projectName}</span>
                  <span
                    className="text-[10px] px-1 rounded"
                    style={{
                      backgroundColor: "var(--term-bg-surface)",
                      color: "var(--term-text-muted)",
                    }}
                  >
                    {pt.activeMode}
                  </span>
                </button>
              ))}
            </>
          )}

          {/* Ad-hoc section */}
          {adHocSessions.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{ color: "var(--term-text-muted)", backgroundColor: "var(--term-bg-surface)" }}
              >
                Terminals
              </div>
              {adHocSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    onSelectAdHoc(session.id);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                  style={{ color: "var(--term-text-primary)" }}
                >
                  <TerminalIcon className="w-3 h-3" style={{ color: "var(--term-text-muted)" }} />
                  <span className="truncate flex-1">{session.name}</span>
                </button>
              ))}
            </>
          )}

          {/* New terminal actions */}
          <div style={{ borderTop: "1px solid var(--term-border)" }}>
            {/* New terminal for current project (if viewing a project) */}
            {currentProjectId && onNewTerminalForProject && (
              <button
                onClick={() => {
                  onNewTerminalForProject(currentProjectId, currentMode ?? "shell");
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                style={{ color: "var(--term-accent)" }}
              >
                <Plus className="w-3 h-3" />
                <span>New {currentMode === "claude" ? "Claude" : "Shell"} for Project</span>
              </button>
            )}
            {/* New generic terminal */}
            <button
              onClick={() => {
                onNewTerminal();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
              style={{ color: "var(--term-text-muted)" }}
            >
              <Plus className="w-3 h-3" />
              <span>New Terminal</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

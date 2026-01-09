"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { ChevronDown, Terminal as TerminalIcon, Check } from "lucide-react";
import { ClaudeIndicator } from "./ClaudeIndicator";
import type { ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import type { TerminalSession } from "@/lib/hooks/use-terminal-sessions";

export interface TerminalSwitcherProps {
  currentName: string;
  currentMode?: "shell" | "claude";
  currentProjectId?: string | null;
  /** Currently selected session ID (for checkmark indicator) */
  currentSessionId?: string | null;
  projectTerminals: ProjectTerminal[];
  adHocSessions: TerminalSession[];
  onSelectProject: (projectId: string) => void;
  onSelectAdHoc: (sessionId: string) => void;
  isMobile?: boolean;
}

/**
 * Dropdown for switching between terminals.
 * Contains ONLY terminal list for selection - no creation actions.
 * Creation is handled by + icon in pane header.
 */
export function TerminalSwitcher({
  currentName,
  currentMode,
  currentProjectId,
  currentSessionId,
  projectTerminals,
  adHocSessions,
  onSelectProject,
  onSelectAdHoc,
  isMobile = false,
}: TerminalSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Sort projects alphabetically by name
  const sortedProjects = useMemo(() => {
    return [...projectTerminals].sort((a, b) =>
      a.projectName.localeCompare(b.projectName),
    );
  }, [projectTerminals]);

  // Sort ad-hoc sessions alphabetically by name
  const sortedSessions = useMemo(() => {
    return [...adHocSessions].sort((a, b) => a.name.localeCompare(b.name));
  }, [adHocSessions]);

  return (
    <div ref={dropdownRef} className="relative flex items-center gap-1">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate max-w-[140px] transition-all duration-150",
          "hover:bg-[var(--term-bg-elevated)]",
        )}
        style={{
          color: "var(--term-text-primary)",
        }}
        title={currentName}
      >
        {currentMode === "claude" ? (
          <ClaudeIndicator state="idle" />
        ) : (
          <TerminalIcon
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "var(--term-text-muted)" }}
          />
        )}
        <span className="truncate">{currentName}</span>
        <ChevronDown
          className={clsx(
            "w-3 h-3 flex-shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Dropdown - terminal list ONLY, no creation actions */}
      {isOpen && (
        <div
          className={clsx(
            "absolute left-0 top-full mt-1 z-50 rounded-md shadow-lg overflow-hidden",
            isMobile ? "min-w-[200px]" : "min-w-[180px]",
          )}
          style={{
            backgroundColor: "var(--term-bg-elevated)",
            border: "1px solid var(--term-border)",
          }}
        >
          {/* Projects section */}
          {sortedProjects.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  color: "var(--term-text-muted)",
                  backgroundColor: "var(--term-bg-surface)",
                }}
              >
                Projects
              </div>
              {sortedProjects.map((pt) => {
                const isSelected = pt.projectId === currentProjectId;
                return (
                  <button
                    key={pt.projectId}
                    onClick={() => {
                      onSelectProject(pt.projectId);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                    style={{
                      color: isSelected
                        ? "var(--term-accent)"
                        : "var(--term-text-primary)",
                    }}
                  >
                    <ClaudeIndicator
                      state={pt.activeMode === "claude" ? "idle" : "none"}
                    />
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
                    {isSelected && (
                      <Check
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: "var(--term-accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Ad-hoc section */}
          {sortedSessions.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  color: "var(--term-text-muted)",
                  backgroundColor: "var(--term-bg-surface)",
                }}
              >
                Terminals
              </div>
              {sortedSessions.map((session) => {
                const isSelected = session.id === currentSessionId;
                return (
                  <button
                    key={session.id}
                    onClick={() => {
                      onSelectAdHoc(session.id);
                      setIsOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                    style={{
                      color: isSelected
                        ? "var(--term-accent)"
                        : "var(--term-text-primary)",
                    }}
                  >
                    <TerminalIcon
                      className="w-3 h-3"
                      style={{ color: "var(--term-text-muted)" }}
                    />
                    <span className="truncate flex-1">{session.name}</span>
                    {isSelected && (
                      <Check
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: "var(--term-accent)" }}
                      />
                    )}
                  </button>
                );
              })}
            </>
          )}

          {/* Empty state */}
          {sortedProjects.length === 0 && sortedSessions.length === 0 && (
            <div
              className="px-3 py-4 text-xs text-center"
              style={{ color: "var(--term-text-muted)" }}
            >
              No terminals open
            </div>
          )}
        </div>
      )}
    </div>
  );
}

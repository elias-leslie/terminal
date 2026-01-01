"use client";

import { clsx } from "clsx";
import { ClaudeIndicator } from "./ClaudeIndicator";
import { TabModeDropdown } from "./TabModeDropdown";
import { TabActionMenu } from "./TabActionMenu";
import { ProjectTerminal } from "@/lib/hooks/use-project-terminals";

// ============================================================================
// Utility Functions
// ============================================================================

function getTabClassName(isActive: boolean, isMobile: boolean): string {
  return clsx(
    "flex items-center rounded-md transition-all duration-200 cursor-pointer",
    "group min-w-0 flex-shrink-0",
    isMobile
      ? "gap-1 px-2 py-1 text-xs min-h-[36px]"
      : "gap-1.5 px-2 py-1.5 text-sm",
    isActive
      ? "tab-active"
      : "tab-inactive"
  );
}

// ============================================================================
// Types
// ============================================================================

export interface ProjectTabProps {
  // Project terminal data
  projectTerminal: ProjectTerminal;

  // Active state
  isActive: boolean;

  // Handlers
  onClick: () => void;
  onModeChange: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
  onReset: (projectId: string) => void;
  onDisable: (projectId: string) => void;

  // Ref callback for tab element
  tabRef: (el: HTMLDivElement | null) => void;

  // UI state
  isMobile: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function ProjectTab({
  projectTerminal: pt,
  isActive,
  onClick,
  onModeChange,
  onReset,
  onDisable,
  tabRef,
  isMobile,
}: ProjectTabProps) {
  return (
    <div
      ref={tabRef}
      onClick={onClick}
      className={getTabClassName(isActive, isMobile)}
    >
      {/* Claude indicator for project tabs */}
      <ClaudeIndicator state={pt.activeMode === "claude" ? "idle" : "none"} />
      {/* Project name */}
      <span className={clsx("truncate", isMobile ? "max-w-[80px]" : "max-w-[100px]")}>
        {pt.projectName}
      </span>
      {/* Mode dropdown - stop propagation to prevent tab click */}
      <div onClick={(e) => e.stopPropagation()}>
        <TabModeDropdown
          value={pt.activeMode}
          onChange={(mode) => onModeChange(
            pt.projectId,
            mode,
            pt.shellSessionId,
            pt.claudeSessionId,
            pt.rootPath
          )}
          isMobile={isMobile}
        />
      </div>
      {/* Action menu - stop propagation to prevent tab click */}
      <div onClick={(e) => e.stopPropagation()}>
        <TabActionMenu
          tabType="project"
          onReset={() => onReset(pt.projectId)}
          onClose={() => onDisable(pt.projectId)}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

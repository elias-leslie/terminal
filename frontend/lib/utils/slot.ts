/**
 * Slot helper utilities for discriminated union access.
 * Used by SplitPane and other components that work with TerminalSlot.
 */

import type {
  ProjectTerminal,
  ProjectSession,
} from "@/lib/hooks/use-project-terminals";
import type { TerminalSession } from "@/lib/hooks/use-terminal-sessions";

// Slot types for split-pane terminals
export interface ProjectSlot {
  type: "project";
  projectId: string;
  projectName: string;
  rootPath: string | null;
  activeMode: "shell" | "claude";
  // Current active session (based on mode)
  activeSessionId: string | null;
  // Session badge (1-indexed position among project sessions)
  sessionBadge: number | null;
  // Claude state for the active session
  claudeState?: "not_started" | "starting" | "running" | "stopped" | "error";
}

export interface AdHocSlot {
  type: "adhoc";
  sessionId: string;
  name: string;
  workingDir: string | null;
}

export type TerminalSlot = ProjectSlot | AdHocSlot;

/**
 * Get the active session ID for a slot.
 * For project slots, returns the active session ID.
 */
export function getSlotSessionId(slot: TerminalSlot): string | null {
  if (slot.type === "project") {
    return slot.activeSessionId;
  }
  return slot.sessionId;
}

/**
 * Get a unique panel ID for a slot.
 */
export function getSlotPanelId(slot: TerminalSlot): string {
  if (slot.type === "project") {
    return `project-${slot.projectId}`;
  }
  return `adhoc-${slot.sessionId}`;
}

/**
 * Get display name for a slot (includes badge if applicable).
 */
export function getSlotName(slot: TerminalSlot): string {
  if (slot.type === "project") {
    const badge = slot.sessionBadge;
    if (badge !== null && badge > 1) {
      return `${slot.projectName} [${badge}]`;
    }
    return slot.projectName;
  }
  return slot.name;
}

/**
 * Get base project name without badge.
 */
export function getSlotBaseName(slot: TerminalSlot): string {
  if (slot.type === "project") {
    return slot.projectName;
  }
  return slot.name;
}

/**
 * Get working directory for a slot.
 */
export function getSlotWorkingDir(slot: TerminalSlot): string | null {
  if (slot.type === "project") {
    return slot.rootPath;
  }
  return slot.workingDir;
}

/**
 * Find the active slot based on active session ID.
 * Searches project terminals first, then ad-hoc sessions.
 */
export function findActiveSlot(
  activeSessionId: string | null,
  projectTerminals: ProjectTerminal[],
  adHocSessions: TerminalSession[],
): TerminalSlot | null {
  if (!activeSessionId) return null;

  // Check if active session belongs to a project
  for (const pt of projectTerminals) {
    const projectSession = pt.sessions.find(
      (ps: ProjectSession) => ps.session.id === activeSessionId,
    );
    if (projectSession) {
      return {
        type: "project",
        projectId: pt.projectId,
        projectName: pt.projectName,
        rootPath: pt.rootPath,
        activeMode: pt.activeMode,
        activeSessionId: projectSession.session.id,
        sessionBadge: projectSession.badge,
        claudeState: projectSession.session.claude_state,
      };
    }
  }

  // Check ad-hoc sessions
  const adHoc = adHocSessions.find((s) => s.id === activeSessionId);
  if (adHoc) {
    return {
      type: "adhoc",
      sessionId: adHoc.id,
      name: adHoc.name,
      workingDir: adHoc.working_dir,
    };
  }

  return null;
}

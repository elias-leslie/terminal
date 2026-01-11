/**
 * Slot helper utilities for discriminated union access.
 * Used by SplitPane and other components that work with TerminalSlot.
 *
 * NOTE: This file is being migrated to pane-based architecture.
 * The `TerminalSlot` type is being replaced by pane-derived slots.
 * During migration, both approaches coexist.
 */

import type {
  ProjectTerminal,
  ProjectSession,
} from "@/lib/hooks/use-project-terminals";
import type { TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import type { TerminalPane, PaneSession } from "@/lib/hooks/use-terminal-panes";

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
 * Works with both TerminalSlot and PaneSlot.
 */
export function getSlotSessionId(slot: TerminalSlot | PaneSlot): string | null {
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

// ============================================================================
// Pane-based Slot Derivation (NEW - migration in progress)
// ============================================================================

/**
 * Extended slot type that includes the pane ID for direct DB operations.
 * This type wraps the base TerminalSlot with additional pane metadata.
 */
export interface PaneBasedSlot extends ProjectSlot {
  /** Pane ID for DB operations (swap, delete, etc.) */
  paneId: string;
}

export interface AdHocPaneSlot extends AdHocSlot {
  /** Pane ID for DB operations */
  paneId: string;
}

export type PaneSlot = PaneBasedSlot | AdHocPaneSlot;

/**
 * Convert a TerminalPane to a TerminalSlot for UI rendering.
 * This bridges the new pane API with existing slot-based components.
 */
export function paneToSlot(pane: TerminalPane): PaneSlot {
  if (pane.pane_type === "project") {
    const activeSession = pane.sessions.find(
      (s) => s.mode === pane.active_mode,
    );
    const claudeSession = pane.sessions.find((s) => s.mode === "claude");
    return {
      type: "project",
      paneId: pane.id,
      projectId: pane.project_id!,
      projectName: pane.pane_name,
      rootPath: activeSession?.working_dir ?? null,
      activeMode: pane.active_mode,
      activeSessionId: activeSession?.id ?? null,
      sessionBadge: null, // Badge is now part of pane_name
      claudeState: claudeSession
        ? ("not_started" as const) // TODO: fetch from session
        : undefined,
    };
  }

  // Ad-hoc pane
  const session = pane.sessions[0];
  return {
    type: "adhoc",
    paneId: pane.id,
    sessionId: session?.id ?? "",
    name: pane.pane_name,
    workingDir: session?.working_dir ?? null,
  };
}

/**
 * Convert array of TerminalPanes to PaneSlots.
 * Panes are already ordered by pane_order from the API.
 */
export function panesToSlots(panes: TerminalPane[]): PaneSlot[] {
  return panes.map(paneToSlot);
}

/**
 * Get the pane ID from a PaneSlot.
 */
export function getPaneId(slot: PaneSlot): string {
  return slot.paneId;
}

/**
 * Check if a slot is a PaneSlot (has paneId).
 */
export function isPaneSlot(slot: TerminalSlot | PaneSlot): slot is PaneSlot {
  return "paneId" in slot;
}

/**
 * Slot helper utilities for discriminated union access.
 * Used by SplitPane and other components that work with TerminalSlot.
 */

// Slot types for split-pane terminals
export interface ProjectSlot {
  type: "project";
  projectId: string;
  projectName: string;
  rootPath: string | null;
  activeMode: "shell" | "claude";
  shellSessionId: string | null;
  claudeSessionId: string | null;
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
 * For project slots, returns claude or shell session based on active mode.
 */
export function getSlotSessionId(slot: TerminalSlot): string | null {
  if (slot.type === "project") {
    return slot.activeMode === "claude" ? slot.claudeSessionId : slot.shellSessionId;
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
 * Get display name for a slot.
 */
export function getSlotName(slot: TerminalSlot): string {
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

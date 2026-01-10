/**
 * Session creation utilities
 */

import type { ProjectTerminal } from "@/lib/hooks/use-project-terminals";

/**
 * Get the active session ID for a project based on its current mode.
 * @param pt - Project terminal with sessions array
 * @returns Session ID for the active mode, or null if not set
 */
export function getProjectSessionId(pt: ProjectTerminal): string | null {
  return pt.activeSessionId;
}

interface CreateProjectSessionParams {
  projectId: string;
  mode: "shell" | "claude";
  workingDir: string | null;
}

interface TerminalSession {
  id: string;
  name: string;
  project_id: string | null;
  working_dir: string | null;
  mode: "shell" | "claude";
  is_alive: boolean;
  created_at: string;
  last_accessed_at: string;
  claude_state?: "not_started" | "starting" | "running" | "stopped" | "error";
}

/**
 * Generate next sequential terminal name (Terminal 1, Terminal 2, etc.)
 * @param sessions - Array of sessions with name property
 * @returns Next available terminal name
 */
export function getNextTerminalName(sessions: Array<{ name: string }>): string {
  // Find the highest "Terminal N" number
  let maxNum = 0;
  for (const session of sessions) {
    const match = session.name.match(/^Terminal\s+(\d+)$/i);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `Terminal ${maxNum + 1}`;
}

/**
 * @deprecated Direct session creation is blocked. Use pane API instead:
 * - createProjectPane() from useTerminalPanes hook for project terminals
 * - createAdHocPane() from useTerminalPanes hook for ad-hoc terminals
 *
 * Sessions are now created automatically when panes are created:
 * - Project panes: shell + claude sessions (toggle via setActiveMode)
 * - Ad-hoc panes: shell session only
 */
export async function createProjectSession(
  _params: CreateProjectSessionParams,
): Promise<never> {
  throw new Error(
    "Direct session creation is blocked. Use createProjectPane() or createAdHocPane() from useTerminalPanes hook instead.",
  );
}

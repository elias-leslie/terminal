/**
 * Session creation utilities
 */

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
 * Create a new project-associated terminal session
 * @param params - Session creation parameters
 * @returns Created session object
 * @throws Error if session creation fails
 */
export async function createProjectSession(
  params: CreateProjectSessionParams
): Promise<TerminalSession> {
  const { projectId, mode, workingDir } = params;

  try {
    const res = await fetch("/api/terminal/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Project: ${projectId}`,
        project_id: projectId,
        working_dir: workingDir,
        mode,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create session: ${res.statusText}`);
    }

    const session: TerminalSession = await res.json();
    return session;
  } catch (error) {
    console.error("Failed to create project session:", error);
    throw error;
  }
}

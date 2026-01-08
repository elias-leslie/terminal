"use client";

import { useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTerminalSessions, TerminalSession } from "./use-terminal-sessions";
import { useProjectTerminals, ProjectTerminal } from "./use-project-terminals";

// ============================================================================
// Types
// ============================================================================

export interface UseActiveSessionResult {
  /** The currently active session ID (derived from URL, never stored) */
  activeSessionId: string | null;

  /** The active session object (for convenience) */
  activeSession: TerminalSession | null;

  /** Whether we're in a valid state (have sessions and have active) */
  isValid: boolean;

  /** Switch to a different session (updates URL) */
  switchToSession: (sessionId: string) => void;

  /** For project tabs: get the right session for current mode */
  getProjectActiveSession: (projectId: string) => TerminalSession | null;

  /** All sessions for reference */
  sessions: TerminalSession[];

  /** Project terminals for reference */
  projectTerminals: ProjectTerminal[];

  /** Ad-hoc sessions for reference */
  adHocSessions: TerminalSession[];

  /** Loading state */
  isLoading: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that derives the active session from URL + project mode.
 *
 * This is the SINGLE source of truth for which session is active.
 * It replaces scattered `activeId` useState calls with URL-based derivation.
 *
 * Derivation logic:
 * 1. Check URL `searchParams` for `?session=<id>`
 * 2. If valid session ID in URL, that's the active session
 * 3. If `?project=<id>` param exists, find session with matching project_id
 * 4. If no URL param but sessions exist, use first session
 * 5. If no sessions, return null
 *
 * @example
 * ```tsx
 * const { activeSessionId, activeSession, switchToSession } = useActiveSession();
 *
 * return (
 *   <div>
 *     {sessions.map(s => (
 *       <button
 *         key={s.id}
 *         onClick={() => switchToSession(s.id)}
 *         className={s.id === activeSessionId ? "active" : ""}
 *       >
 *         {s.name}
 *       </button>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useActiveSession(): UseActiveSessionResult {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get session data from existing hooks
  const { sessions, isLoading: sessionsLoading } = useTerminalSessions();
  const {
    projectTerminals,
    adHocSessions,
    isLoading: projectsLoading,
  } = useProjectTerminals();

  const isLoading = sessionsLoading || projectsLoading;

  // Get session ID and project ID from URL
  const urlSessionId = searchParams.get("session");
  const urlProjectId = searchParams.get("project");

  // Derive active session ID from URL + available sessions
  const activeSessionId = useMemo(() => {
    // No sessions at all
    if (sessions.length === 0) {
      return null;
    }

    // Check if URL session ID exists and is valid
    if (urlSessionId) {
      const sessionExists = sessions.some((s) => s.id === urlSessionId);
      if (sessionExists) {
        return urlSessionId;
      }
      // URL has invalid session ID - fall through to project/default
    }

    // If project param is set, find a session for that project
    if (urlProjectId) {
      const projectSession = sessions.find(
        (s) => s.project_id === urlProjectId,
      );
      if (projectSession) {
        return projectSession.id;
      }
      // No session for this project yet - fall through to default
    }

    // Default to first session if no valid URL param
    return sessions[0]?.id ?? null;
  }, [sessions, urlSessionId, urlProjectId]);

  // Get the active session object
  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((s) => s.id === activeSessionId) ?? null;
  }, [sessions, activeSessionId]);

  // Whether we're in a valid state
  const isValid = activeSessionId !== null && activeSession !== null;

  // Switch to a different session by updating the URL
  const switchToSession = useCallback(
    (sessionId: string) => {
      // Verify the session exists before switching
      const sessionExists = sessions.some((s) => s.id === sessionId);
      if (!sessionExists) {
        console.warn(`switchToSession: session ${sessionId} does not exist`);
        return;
      }

      // Build new URL with session param, preserving other params
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", sessionId);

      // Use router.push with scroll: false for shallow navigation
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [sessions, searchParams, router],
  );

  // Get the active session for a project based on its current mode
  const getProjectActiveSession = useCallback(
    (projectId: string): TerminalSession | null => {
      const project = projectTerminals.find((p) => p.projectId === projectId);
      if (!project) return null;

      // Return the active session (already computed by useProjectTerminals)
      return project.activeSession;
    },
    [projectTerminals],
  );

  return {
    activeSessionId,
    activeSession,
    isValid,
    switchToSession,
    getProjectActiveSession,
    sessions,
    projectTerminals,
    adHocSessions,
    isLoading,
  };
}

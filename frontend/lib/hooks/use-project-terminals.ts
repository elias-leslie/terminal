"use client";

import { useMemo } from "react";
import { useProjectSettings, ProjectSetting } from "./use-project-settings";
import { useTerminalSessions, TerminalSession } from "./use-terminal-sessions";

// ============================================================================
// Types
// ============================================================================

export interface ProjectTerminal {
  projectId: string;
  projectName: string;
  rootPath: string | null;
  mode: "shell" | "claude";
  sessionId: string | null; // null if not yet created
  session: TerminalSession | null;
}

export interface UseProjectTerminalsResult {
  /** Enabled projects with session info merged */
  projectTerminals: ProjectTerminal[];
  /** Sessions without a project_id (generic shells) */
  adHocSessions: TerminalSession[];
  /** All data is loading */
  isLoading: boolean;
  /** Error occurred */
  isError: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that merges project settings with terminal sessions.
 *
 * Provides:
 * - projectTerminals: Enabled projects with session info (sessionId, etc.)
 * - adHocSessions: Sessions that aren't linked to projects
 *
 * @example
 * ```tsx
 * const { projectTerminals, adHocSessions } = useProjectTerminals();
 *
 * return (
 *   <>
 *     {projectTerminals.map(pt => (
 *       <Tab key={pt.projectId}>
 *         {pt.projectName}
 *       </Tab>
 *     ))}
 *     <Divider />
 *     {adHocSessions.map(s => (
 *       <Tab key={s.id}>{s.name}</Tab>
 *     ))}
 *   </>
 * );
 * ```
 */
export function useProjectTerminals(): UseProjectTerminalsResult {
  const {
    enabledProjects,
    isLoading: projectsLoading,
    isError: projectsError,
  } = useProjectSettings();

  const {
    sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useTerminalSessions();

  // Merge enabled projects with sessions
  const projectTerminals = useMemo(() => {
    return enabledProjects.map((project) => {
      // Find session for this project
      const session = sessions.find((s) => s.project_id === project.id) ?? null;

      return {
        projectId: project.id,
        projectName: project.name,
        rootPath: project.root_path,
        mode: project.terminal_mode,
        sessionId: session?.id ?? null,
        session,
      };
    });
  }, [enabledProjects, sessions]);

  // Ad-hoc sessions: sessions without project_id
  const adHocSessions = useMemo(() => {
    return sessions.filter((s) => !s.project_id);
  }, [sessions]);

  return {
    projectTerminals,
    adHocSessions,
    isLoading: projectsLoading || sessionsLoading,
    isError: projectsError || sessionsError,
  };
}

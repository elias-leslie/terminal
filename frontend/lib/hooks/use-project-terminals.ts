"use client";

import { useMemo, useCallback } from "react";
import { useProjectSettings } from "./use-project-settings";
import { useTerminalSessions, TerminalSession } from "./use-terminal-sessions";

// ============================================================================
// Types
// ============================================================================

export interface ProjectTerminal {
  projectId: string;
  projectName: string;
  rootPath: string | null;
  activeMode: "shell" | "claude";
  // Dual session IDs
  shellSessionId: string | null;
  claudeSessionId: string | null;
  // Dual session objects
  shellSession: TerminalSession | null;
  claudeSession: TerminalSession | null;
}

export interface UseProjectTerminalsResult {
  /** Enabled projects with dual session info merged */
  projectTerminals: ProjectTerminal[];
  /** Sessions without a project_id (generic shells) */
  adHocSessions: TerminalSession[];
  /** All data is loading */
  isLoading: boolean;
  /** Error occurred */
  isError: boolean;
  /** Switch project mode (shell <-> claude) */
  switchMode: (projectId: string, mode: "shell" | "claude") => Promise<void>;
  /** Reset project sessions (delete and recreate) */
  resetProject: (projectId: string) => Promise<void>;
  /** Disable project terminal */
  disableProject: (projectId: string) => Promise<void>;
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
    switchMode: switchProjectMode,
    updateSettings,
    isLoading: projectsLoading,
    isError: projectsError,
  } = useProjectSettings();

  const {
    sessions,
    isLoading: sessionsLoading,
    isError: sessionsError,
  } = useTerminalSessions();

  // Merge enabled projects with dual sessions
  const projectTerminals = useMemo(() => {
    return enabledProjects.map((project) => {
      // Find shell and claude sessions for this project
      const shellSession = sessions.find(
        (s) => s.project_id === project.id && s.mode === "shell"
      ) ?? null;
      const claudeSession = sessions.find(
        (s) => s.project_id === project.id && s.mode === "claude"
      ) ?? null;

      return {
        projectId: project.id,
        projectName: project.name,
        rootPath: project.root_path,
        activeMode: project.active_mode,
        shellSessionId: shellSession?.id ?? null,
        claudeSessionId: claudeSession?.id ?? null,
        shellSession,
        claudeSession,
      };
    });
  }, [enabledProjects, sessions]);

  // Ad-hoc sessions: sessions without project_id
  const adHocSessions = useMemo(() => {
    return sessions.filter((s) => !s.project_id);
  }, [sessions]);

  // Switch project mode
  const switchMode = useCallback(
    async (projectId: string, mode: "shell" | "claude") => {
      await switchProjectMode(projectId, mode);
    },
    [switchProjectMode]
  );

  // Reset project sessions via API
  const resetProject = useCallback(async (projectId: string) => {
    const res = await fetch(`/api/terminal/projects/${projectId}/reset`, {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: "Failed to reset project" }));
      throw new Error(error.detail || "Failed to reset project");
    }
  }, []);

  // Disable project terminal via API
  const disableProject = useCallback(
    async (projectId: string) => {
      await updateSettings(projectId, { enabled: false });
    },
    [updateSettings]
  );

  return {
    projectTerminals,
    adHocSessions,
    isLoading: projectsLoading || sessionsLoading,
    isError: projectsError || sessionsError,
    switchMode,
    resetProject,
    disableProject,
  };
}

"use client";

import { useCallback, useRef, MutableRefObject } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useClaudePolling } from "./use-claude-polling";
import { createProjectSession } from "@/lib/utils/session";
import { TerminalSession } from "./use-terminal-sessions";

/** Delay for tmux session initialization */
const TMUX_INIT_DELAY_MS = 300;

/** Delay before scrolling tab into view */
const TAB_SCROLL_DELAY_MS = 100;

interface SwitchProjectModeParams {
  projectId: string;
  mode: "shell" | "claude";
  shellSessionId: string | null;
  claudeSessionId: string | null;
  rootPath: string | null;
}

interface UseProjectModeSwitchOptions {
  /** Function to switch mode in backend (from useProjectTerminals) */
  switchMode: (projectId: string, mode: "shell" | "claude") => Promise<void>;
  /** All current sessions (for checking claude_state) */
  sessions: TerminalSession[];
  /** Refs to project tabs for scroll-into-view */
  projectTabRefs: MutableRefObject<Map<string, HTMLDivElement>>;
}

interface UseProjectModeSwitchReturn {
  /** Switch project mode with full orchestration */
  switchProjectMode: (params: SwitchProjectModeParams) => Promise<void>;
  /** Whether polling is currently active */
  isPolling: boolean;
}

/**
 * Hook for orchestrating project mode switches (shell <-> claude).
 *
 * Handles the 6-step orchestration:
 * 1. Update backend mode
 * 2. Determine/create target session
 * 3. Check Claude state (if switching to claude)
 * 4. Start Claude and poll for confirmation
 * 5. Navigate to session via URL
 * 6. Scroll tab into view
 *
 * @example
 * ```tsx
 * const { switchProjectMode } = useProjectModeSwitch({
 *   switchMode,
 *   sessions,
 *   projectTabRefs,
 * });
 *
 * // In mode dropdown handler:
 * await switchProjectMode({
 *   projectId: "my-project",
 *   mode: "claude",
 *   shellSessionId: "shell-123",
 *   claudeSessionId: null,
 *   rootPath: "/home/user/project",
 * });
 * ```
 */
export function useProjectModeSwitch({
  switchMode,
  sessions,
  projectTabRefs,
}: UseProjectModeSwitchOptions): UseProjectModeSwitchReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Claude polling hook for starting Claude and polling for state changes
  const { startClaude, isPolling } = useClaudePolling();

  // Helper to update URL with session param
  const navigateToSession = useCallback(
    (sessionId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("session", sessionId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router]
  );

  // Helper to start Claude in a session and wait for confirmation
  const startClaudeInSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      return startClaude(sessionId);
    },
    [startClaude]
  );

  // Main orchestration function
  const switchProjectMode = useCallback(
    async (params: SwitchProjectModeParams): Promise<void> => {
      const { projectId, mode, shellSessionId, claudeSessionId, rootPath } = params;

      // 1. Update mode in backend (optimistic update happens in switchMode)
      await switchMode(projectId, mode);

      // 2. Determine which session to use
      let targetSessionId = mode === "claude" ? claudeSessionId : shellSessionId;
      let needsClaudeStart = false;
      let isNewSession = false;

      // 3. Create session if it doesn't exist
      if (!targetSessionId) {
        const newSession = await createProjectSession({
          projectId,
          mode,
          workingDir: rootPath,
        });
        targetSessionId = newSession.id;
        isNewSession = true;
        // New claude session always needs Claude started
        if (mode === "claude") {
          needsClaudeStart = true;
        }
      } else if (mode === "claude") {
        // Existing claude session - check if Claude is already running
        // Look up session in the cache to check claude_state
        const existingSession = sessions.find((s) => s.id === targetSessionId);
        const claudeState = existingSession?.claude_state;
        // Only start Claude if NOT already running or starting
        needsClaudeStart = claudeState !== "running" && claudeState !== "starting";
      }

      // 4. If switching to Claude mode AND Claude needs to be started
      if (mode === "claude" && targetSessionId && needsClaudeStart) {
        // Delay for new sessions to let tmux initialize
        if (isNewSession) {
          await new Promise((resolve) => setTimeout(resolve, TMUX_INIT_DELAY_MS));
        }
        await startClaudeInSession(targetSessionId);
      }

      // 5. Switch to the session via URL
      if (targetSessionId) {
        navigateToSession(targetSessionId);
      }

      // 6. Scroll tab into view after mode switch
      setTimeout(() => {
        projectTabRefs.current.get(projectId)?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }, TAB_SCROLL_DELAY_MS);
    },
    [switchMode, sessions, startClaudeInSession, navigateToSession, projectTabRefs]
  );

  return {
    switchProjectMode,
    isPolling,
  };
}

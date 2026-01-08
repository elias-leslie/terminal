import { useCallback, MutableRefObject } from "react";
import { type TerminalSlot, getSlotSessionId } from "@/lib/utils/slot";
import { type TerminalHandle } from "@/components/Terminal";

interface UseTerminalSlotHandlersParams {
  terminalRefs: MutableRefObject<Map<string, TerminalHandle | null>>;
  switchToSession: (sessionId: string) => void;
  resetProject: (projectId: string) => Promise<void>;
  reset: (sessionId: string) => Promise<unknown>;
  disableProject: (projectId: string) => Promise<void>;
  remove: (sessionId: string) => Promise<void>;
  handleNewTerminalForProject: (projectId: string, mode: "shell" | "claude") => void;
  setShowCleaner: (show: boolean) => void;
  setCleanerRawPrompt: (prompt: string) => void;
}

export function useTerminalSlotHandlers({
  terminalRefs,
  switchToSession,
  resetProject,
  reset,
  disableProject,
  remove,
  handleNewTerminalForProject,
  setShowCleaner,
  setCleanerRawPrompt,
}: UseTerminalSlotHandlersParams) {
  // Handler for switching to a slot's terminal
  const handleSlotSwitch = useCallback((slot: TerminalSlot) => {
    const sessionId = getSlotSessionId(slot);
    if (sessionId) {
      switchToSession(sessionId);
    }
  }, [switchToSession]);

  // Handler for resetting a slot's terminal
  const handleSlotReset = useCallback(async (slot: TerminalSlot) => {
    if (slot.type === "project") {
      await resetProject(slot.projectId);
    } else {
      await reset(slot.sessionId);
    }
  }, [resetProject, reset]);

  // Handler for closing a slot's terminal
  const handleSlotClose = useCallback(async (slot: TerminalSlot) => {
    if (slot.type === "project") {
      await disableProject(slot.projectId);
    } else {
      await remove(slot.sessionId);
    }
  }, [disableProject, remove]);

  // Handler for opening prompt cleaner for a slot
  const handleSlotClean = useCallback((slot: TerminalSlot) => {
    const sessionId = getSlotSessionId(slot);
    if (!sessionId) return;
    const terminalRef = terminalRefs.current.get(sessionId);
    if (!terminalRef) return;
    const input = terminalRef.getLastLine();
    if (!input.trim()) return;
    setCleanerRawPrompt(input);
    setShowCleaner(true);
  }, [terminalRefs, setCleanerRawPrompt, setShowCleaner]);

  // Handler for creating new shell in a slot's project
  const handleSlotNewShell = useCallback((slot: TerminalSlot) => {
    if (slot.type === "project") {
      handleNewTerminalForProject(slot.projectId, "shell");
    }
  }, [handleNewTerminalForProject]);

  // Handler for creating new Claude terminal in a slot's project
  const handleSlotNewClaude = useCallback((slot: TerminalSlot) => {
    if (slot.type === "project") {
      handleNewTerminalForProject(slot.projectId, "claude");
    }
  }, [handleNewTerminalForProject]);

  return {
    handleSlotSwitch,
    handleSlotReset,
    handleSlotClose,
    handleSlotClean,
    handleSlotNewShell,
    handleSlotNewClaude,
  };
}

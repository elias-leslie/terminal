import { RefObject } from "react";
import { ConnectionStatus } from "./Terminal";
import { LayoutMode } from "./LayoutModeButton";
import { KeyboardSizePreset } from "./SettingsDropdown";
import { ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import { TerminalFontId, TerminalFontSize } from "@/lib/hooks/use-terminal-settings";

export interface TabBarProps {
  // Project terminals data
  projectTerminals: ProjectTerminal[];
  projectTabRefs: RefObject<Map<string, HTMLDivElement>>;

  // Ad-hoc sessions data
  adHocSessions: TerminalSession[];

  // Active state
  activeSessionId: string | null;

  // Terminal statuses
  terminalStatuses: Map<string, ConnectionStatus>;

  // Handlers
  onProjectTabClick: (pt: ProjectTerminal) => void;
  onProjectModeChange: (
    projectId: string,
    mode: "shell" | "claude",
    shellSessionId: string | null,
    claudeSessionId: string | null,
    rootPath: string | null
  ) => void;
  onAdHocTabClick: (sessionId: string) => void;
  onResetProject: (projectId: string) => void;
  onDisableProject: (projectId: string) => void;
  onResetAdHoc: (sessionId: string) => void;
  onRemoveAdHoc: (sessionId: string) => void;
  onAddTerminal: () => void;
  onReconnect: () => void;
  onResetAll: () => void;
  onCloseAll: () => void;

  // Tab editing
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  editInputRef: RefObject<HTMLInputElement | null>;
  startEdit: (sessionId: string, currentName: string) => void;
  saveEdit: () => void;
  handleEditKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;

  // Layout
  layoutMode: LayoutMode;
  onLayoutModeChange: (mode: LayoutMode) => void;
  availableLayouts?: LayoutMode[];

  // Settings
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  setFontId: (id: TerminalFontId) => void;
  setFontSize: (size: TerminalFontSize) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  keyboardSize: KeyboardSizePreset;
  onKeyboardSizeChange: (size: KeyboardSizePreset) => void;

  // State
  isMobile: boolean;
  isCreating: boolean;
  showReconnect: boolean;
  activeStatus?: ConnectionStatus;

  // Helper to get session ID for a project
  getProjectSessionId: (pt: ProjectTerminal) => string | null;

  // Active session info (for SessionInfoIcon)
  activeSessionMode?: "shell" | "claude";
  activeSessionTimestamp?: string;
}

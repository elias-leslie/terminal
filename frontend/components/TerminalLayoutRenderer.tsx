"use client";

import { Plus } from "lucide-react";
import { SingleModeTerminals } from "./SingleModeTerminals";
import { GridLayout } from "./GridLayout";
import { TerminalComponent, type TerminalHandle } from "./Terminal";
import { type LayoutMode } from "./LayoutModeButton";
import { type GridLayoutMode } from "@/lib/constants/terminal";
import { type TerminalSlot } from "@/lib/utils/slot";
import { type TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import { type ConnectionStatus } from "./terminal.types";
import { type TerminalMode } from "./ModeToggle";

interface TerminalLayoutRendererProps {
  // Session data
  sessions: TerminalSession[];
  activeSessionId: string | null;
  projectPath?: string;

  // Layout mode
  layoutMode: LayoutMode;
  availableLayouts: LayoutMode[];
  isGridMode: boolean;

  // Slots
  terminalSlots: TerminalSlot[];
  orderedSlotIds: string[];
  onReorder: (ids: string[]) => void;

  // Terminal settings
  fontFamily: string;
  fontSize: number;
  scrollback: number;
  cursorStyle: "bar" | "block" | "underline";
  cursorBlink: boolean;
  theme?: Parameters<typeof TerminalComponent>[0]["theme"];

  // Terminal ref and status handlers
  onTerminalRef: (sessionId: string, handle: TerminalHandle | null) => void;
  onStatusChange: (sessionId: string, status: ConnectionStatus) => void;

  // Layout change
  onLayoutChange: (mode: LayoutMode) => void;

  // Slot action handlers
  onSlotSwitch: (slot: TerminalSlot) => void;
  onSlotReset: (slot: TerminalSlot) => void;
  onSlotClose: (slot: TerminalSlot) => void;
  onSlotClean: (slot: TerminalSlot) => void;

  // Pane limits
  canAddPane: boolean;

  // UI callbacks
  onShowSettings: () => void;
  onShowTerminalManager: () => void;
  onUploadClick: () => void;

  // Mode switch handler for project slots
  onModeSwitch?: (
    slot: TerminalSlot,
    mode: TerminalMode,
  ) => void | Promise<void>;
  isModeSwitching?: boolean;

  // Device
  isMobile: boolean;

  // Pane swap (grid mode)
  onSwapPanes?: (slotIdA: string, slotIdB: string) => void;
}

export function TerminalLayoutRenderer({
  sessions,
  activeSessionId,
  projectPath,
  layoutMode,
  availableLayouts,
  isGridMode,
  terminalSlots,
  orderedSlotIds,
  onReorder,
  fontFamily,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  theme,
  onTerminalRef,
  onStatusChange,
  onLayoutChange,
  onSlotSwitch,
  onSlotReset,
  onSlotClose,
  onSlotClean,
  canAddPane,
  onShowSettings,
  onShowTerminalManager,
  onUploadClick,
  onModeSwitch,
  isModeSwitching,
  isMobile,
  onSwapPanes,
}: TerminalLayoutRendererProps) {
  // Single mode - show empty state if no sessions
  if (layoutMode === "single") {
    if (sessions.length === 0) {
      return (
        <div
          className="flex items-center justify-center h-full text-sm"
          style={{ color: "var(--term-text-muted)" }}
        >
          Click <Plus className="w-4 h-4 mx-1 inline" /> to start a terminal
        </div>
      );
    }
    return (
      <SingleModeTerminals
        sessions={sessions}
        activeSessionId={activeSessionId}
        projectPath={projectPath}
        fontFamily={fontFamily}
        fontSize={fontSize}
        scrollback={scrollback}
        cursorStyle={cursorStyle}
        cursorBlink={cursorBlink}
        theme={theme}
        onTerminalRef={onTerminalRef}
        onStatusChange={onStatusChange}
      />
    );
  }

  // Grid mode (only non-single option now)
  return (
    <GridLayout
      layoutMode={layoutMode as GridLayoutMode}
      availableLayouts={availableLayouts}
      onLayout={onLayoutChange}
      slots={terminalSlots}
      orderedSlotIds={orderedSlotIds}
      onReorder={onReorder}
      fontFamily={fontFamily}
      fontSize={fontSize}
      scrollback={scrollback}
      cursorStyle={cursorStyle}
      cursorBlink={cursorBlink}
      theme={theme}
      onTerminalRef={onTerminalRef}
      onStatusChange={onStatusChange}
      onSwitch={onSlotSwitch}
      onSettings={onShowSettings}
      onReset={onSlotReset}
      onClose={onSlotClose}
      onUpload={onUploadClick}
      onClean={onSlotClean}
      onOpenModal={onShowTerminalManager}
      canAddPane={canAddPane}
      onModeSwitch={onModeSwitch}
      isModeSwitching={isModeSwitching}
      onEmptyClick={onShowTerminalManager}
      isMobile={isMobile}
      onSwapPanes={onSwapPanes}
    />
  );
}

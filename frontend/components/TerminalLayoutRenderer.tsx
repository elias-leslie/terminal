"use client";

import { clsx } from "clsx";
import { Plus, Settings, GripVertical } from "lucide-react";
import { Panel, Group } from "react-resizable-panels";
import { SingleModeTerminals } from "./SingleModeTerminals";
import { GridLayout } from "./GridLayout";
import { SplitPane } from "./SplitPane";
import { TerminalComponent, type TerminalHandle } from "./Terminal";
import { LayoutModeButtons, type LayoutMode } from "./LayoutModeButton";
import { type GridLayoutMode } from "@/lib/constants/terminal";
import { type TerminalSlot, getSlotPanelId } from "@/lib/utils/slot";
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
  splitPaneCount: number;

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
}

export function TerminalLayoutRenderer({
  sessions,
  activeSessionId,
  projectPath,
  layoutMode,
  availableLayouts,
  isGridMode,
  splitPaneCount,
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

  // Grid mode
  if (isGridMode) {
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
      />
    );
  }

  // Split pane mode (horizontal/vertical)
  // If no slots, show an empty pane with header
  if (terminalSlots.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header for empty split pane */}
        <div
          className={clsx(
            "flex-shrink-0 flex items-center gap-1",
            isMobile ? "h-9 px-1.5" : "h-8 px-2",
          )}
          style={{
            backgroundColor: "var(--term-bg-surface)",
            borderBottom: "1px solid var(--term-border)",
          }}
        >
          {/* Placeholder drag handle (inactive) */}
          <div className="p-0.5 opacity-30">
            <GripVertical
              className="w-3.5 h-3.5"
              style={{ color: "var(--term-text-muted)" }}
            />
          </div>

          {/* Empty slot label */}
          <span
            className="text-xs px-1.5"
            style={{ color: "var(--term-text-muted)" }}
          >
            Empty
          </span>

          {/* Add terminal button */}
          <button
            onClick={onShowTerminalManager}
            className={clsx(
              "flex items-center justify-center rounded ml-1 transition-all duration-150",
              isMobile ? "w-7 h-7" : "w-5 h-5",
            )}
            style={{
              backgroundColor: "var(--term-bg-surface)",
              border: "1px solid var(--term-border)",
              color: "var(--term-text-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
              e.currentTarget.style.borderColor = "var(--term-accent)";
              e.currentTarget.style.color = "var(--term-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
              e.currentTarget.style.borderColor = "var(--term-border)";
              e.currentTarget.style.color = "var(--term-text-muted)";
            }}
            title="Open terminal"
            aria-label="Open terminal"
          >
            <Plus className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Layout selector */}
          {!isMobile && (
            <div className="flex items-center gap-0.5 mr-1">
              <LayoutModeButtons
                layoutMode={layoutMode}
                onLayoutChange={onLayoutChange}
                availableLayouts={availableLayouts}
              />
            </div>
          )}

          {/* Settings button */}
          <button
            onClick={onShowSettings}
            className={clsx(
              "flex items-center justify-center rounded transition-all duration-150",
              isMobile ? "w-8 h-8" : "w-6 h-6",
            )}
            style={{ color: "var(--term-text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
              e.currentTarget.style.color = "var(--term-accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--term-text-muted)";
            }}
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Empty content area with click to add */}
        <div
          onClick={onShowTerminalManager}
          className="flex-1 flex flex-col items-center justify-center gap-2 cursor-pointer group"
          style={{ backgroundColor: "var(--term-bg-deep)" }}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-150 group-hover:scale-110"
            style={{
              backgroundColor: "var(--term-bg-elevated)",
              border: "1px solid var(--term-border)",
            }}
          >
            <span
              className="text-lg font-light transition-colors group-hover:text-[var(--term-accent)]"
              style={{ color: "var(--term-text-muted)" }}
            >
              +
            </span>
          </div>
          <span
            className="text-xs transition-colors group-hover:text-[var(--term-text-primary)]"
            style={{ color: "var(--term-text-muted)" }}
          >
            Add terminal
          </span>
        </div>
      </div>
    );
  }

  return (
    <Group
      orientation={layoutMode === "horizontal" ? "vertical" : "horizontal"}
      className="h-full"
    >
      {terminalSlots.slice(0, splitPaneCount).map((slot, index) => (
        <SplitPane
          key={getSlotPanelId(slot)}
          slot={slot}
          layoutMode={layoutMode}
          availableLayouts={availableLayouts}
          onLayout={onLayoutChange}
          isLast={index === splitPaneCount - 1}
          paneCount={splitPaneCount}
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
          isMobile={isMobile}
        />
      ))}
    </Group>
  );
}

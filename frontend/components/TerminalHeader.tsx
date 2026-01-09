"use client";

import { clsx } from "clsx";
import { Paperclip, Sparkles } from "lucide-react";
import { TerminalSwitcher } from "./TerminalSwitcher";
import { SettingsDropdown } from "./SettingsDropdown";
import { GlobalActionMenu } from "./GlobalActionMenu";
import { LayoutModeButtons } from "./LayoutModeButton";
import { type TerminalSlot, getSlotSessionId } from "@/lib/utils/slot";
import { type LayoutMode } from "./LayoutModeButton";
import { type ProjectTerminal } from "@/lib/hooks/use-project-terminals";
import { type TerminalSession } from "@/lib/hooks/use-terminal-sessions";
import {
  type TerminalFontId,
  type TerminalFontSize,
  type TerminalScrollback,
  type TerminalCursorStyle,
  type TerminalThemeId,
} from "@/lib/hooks/use-terminal-settings";
import { type KeyboardSizePreset } from "./keyboard/types";

interface TerminalHeaderProps {
  activeSlot: TerminalSlot | null;
  projectTerminals: ProjectTerminal[];
  adHocSessions: TerminalSession[];
  layoutMode: LayoutMode;
  availableLayouts: LayoutMode[];
  isMobile: boolean;
  isCleanerLoading: boolean;
  isUploading: boolean;
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  scrollback: TerminalScrollback;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  themeId: TerminalThemeId;
  showSettings: boolean;
  keyboardSize: KeyboardSizePreset;
  onSelectProject: (projectId: string) => void;
  onSelectAdHoc: (sessionId: string) => void;
  onLayoutChange: (mode: LayoutMode) => void;
  onCleanClick: () => void;
  onUploadClick: () => void;
  onResetAll: () => Promise<unknown>;
  onCloseAll: () => void;
  setFontId: (id: TerminalFontId) => void;
  setFontSize: (size: TerminalFontSize) => void;
  setScrollback: (scrollback: TerminalScrollback) => void;
  setCursorStyle: (style: TerminalCursorStyle) => void;
  setCursorBlink: (blink: boolean) => void;
  setThemeId: (id: TerminalThemeId) => void;
  setShowSettings: (show: boolean) => void;
  setKeyboardSize: (size: KeyboardSizePreset) => void;
}

export function TerminalHeader({
  activeSlot,
  projectTerminals,
  adHocSessions,
  layoutMode,
  availableLayouts,
  isMobile,
  isCleanerLoading,
  isUploading,
  fontId,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  themeId,
  showSettings,
  keyboardSize,
  onSelectProject,
  onSelectAdHoc,
  onLayoutChange,
  onCleanClick,
  onUploadClick,
  onResetAll,
  onCloseAll,
  setFontId,
  setFontSize,
  setScrollback,
  setCursorStyle,
  setCursorBlink,
  setThemeId,
  setShowSettings,
  setKeyboardSize,
}: TerminalHeaderProps) {
  return (
    <div
      className={clsx(
        "flex-shrink-0 flex items-center gap-1",
        isMobile ? "h-9 px-1.5 order-2" : "h-8 px-2 order-1",
      )}
      style={{
        backgroundColor: "var(--term-bg-surface)",
        borderBottom: "1px solid var(--term-border)",
      }}
    >
      {/* Terminal switcher dropdown */}
      <TerminalSwitcher
        currentName={
          activeSlot
            ? activeSlot.type === "project"
              ? activeSlot.projectName
              : activeSlot.name
            : "Terminal"
        }
        currentMode={
          activeSlot?.type === "project" ? activeSlot.activeMode : undefined
        }
        currentProjectId={
          activeSlot?.type === "project" ? activeSlot.projectId : null
        }
        currentSessionId={activeSlot ? getSlotSessionId(activeSlot) : null}
        projectTerminals={projectTerminals}
        adHocSessions={adHocSessions}
        onSelectProject={onSelectProject}
        onSelectAdHoc={onSelectAdHoc}
        isMobile={isMobile}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout mode buttons - desktop only */}
      {!isMobile && (
        <div className="flex items-center gap-0.5 mr-1">
          <LayoutModeButtons
            layoutMode={layoutMode}
            onLayoutChange={onLayoutChange}
            availableLayouts={availableLayouts}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        {/* Prompt cleaner button (Claude mode only) */}
        {activeSlot?.type === "project" &&
          activeSlot.activeMode === "claude" && (
            <button
              onClick={onCleanClick}
              disabled={isCleanerLoading}
              className="p-1.5 rounded transition-colors hover:bg-[var(--term-bg-elevated)] disabled:opacity-50"
              title="Clean and format prompt"
            >
              <Sparkles
                className="w-4 h-4"
                style={{ color: "var(--term-accent)" }}
              />
            </button>
          )}

        {/* Upload button */}
        <button
          onClick={onUploadClick}
          disabled={isUploading}
          className="p-1.5 rounded transition-colors hover:bg-[var(--term-bg-elevated)] disabled:opacity-50"
          title="Upload file"
        >
          <Paperclip
            className="w-4 h-4"
            style={{ color: "var(--term-text-muted)" }}
          />
        </button>

        {/* Global actions menu */}
        <GlobalActionMenu
          onResetAll={onResetAll}
          onCloseAll={onCloseAll}
          isMobile={isMobile}
        />

        {/* Settings dropdown */}
        <SettingsDropdown
          fontId={fontId}
          fontSize={fontSize}
          scrollback={scrollback}
          cursorStyle={cursorStyle}
          cursorBlink={cursorBlink}
          themeId={themeId}
          setFontId={setFontId}
          setFontSize={setFontSize}
          setScrollback={setScrollback}
          setCursorStyle={setCursorStyle}
          setCursorBlink={setCursorBlink}
          setThemeId={setThemeId}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          keyboardSize={keyboardSize}
          setKeyboardSize={setKeyboardSize}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

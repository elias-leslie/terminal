"use client";

import { clsx } from "clsx";
import { Paperclip, Sparkles, Plus } from "lucide-react";
import { TerminalSwitcher } from "./TerminalSwitcher";
import { SettingsDropdown } from "./SettingsDropdown";
import { GlobalActionMenu } from "./GlobalActionMenu";
import { LayoutModeButtons } from "./LayoutModeButton";
import { ModeToggle, TerminalMode } from "./ModeToggle";
import { type PaneSlot } from "@/lib/utils/slot";
import { type LayoutMode } from "./LayoutModeButton";
import {
  type TerminalFontId,
  type TerminalFontSize,
  type TerminalScrollback,
  type TerminalCursorStyle,
  type TerminalThemeId,
} from "@/lib/hooks/use-terminal-settings";
import { type KeyboardSizePreset } from "./keyboard/types";

interface TerminalHeaderProps {
  activeSlot: PaneSlot | null;
  /** All terminal slots (derived from panes) */
  terminalSlots: PaneSlot[];
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
  /** Called when user selects a slot from the dropdown */
  onSelectSlot: (slot: PaneSlot) => void;
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
  // Mode switch for project slots
  onModeSwitch?: (mode: TerminalMode) => void | Promise<void>;
  isModeSwitching?: boolean;
  // Open terminal manager modal
  onOpenTerminalManager?: () => void;
}

export function TerminalHeader({
  activeSlot,
  terminalSlots,
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
  onSelectSlot,
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
  onModeSwitch,
  isModeSwitching = false,
  onOpenTerminalManager,
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
        activeSlot={activeSlot}
        slots={terminalSlots}
        onSelectSlot={onSelectSlot}
        isMobile={isMobile}
      />

      {/* Add terminal button */}
      {onOpenTerminalManager && (
        <button
          onClick={onOpenTerminalManager}
          className={clsx(
            "flex items-center justify-center rounded transition-all duration-150",
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
      )}

      {/* Mode toggle (shell <-> claude) - only for project slots */}
      {activeSlot?.type === "project" && onModeSwitch && (
        <ModeToggle
          value={activeSlot.activeMode}
          onChange={onModeSwitch}
          disabled={isModeSwitching}
          isLoading={isModeSwitching}
          isMobile={isMobile}
        />
      )}

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

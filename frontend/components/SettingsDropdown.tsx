"use client";

import { useCallback, useRef, useMemo, useState, useLayoutEffect } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { Settings2 } from "lucide-react";
import {
  TERMINAL_FONTS,
  TERMINAL_FONT_SIZES,
  TERMINAL_SCROLLBACK_OPTIONS,
  TERMINAL_CURSOR_STYLES,
  TERMINAL_THEMES,
  TerminalFontId,
  TerminalFontSize,
  TerminalScrollback,
  TerminalCursorStyle,
  TerminalThemeId,
} from "@/lib/hooks/use-terminal-settings";

// Keyboard size type
export type KeyboardSizePreset = "small" | "medium" | "large";

export interface SettingsDropdownProps {
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  scrollback: TerminalScrollback;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
  themeId: TerminalThemeId;
  setFontId: (id: TerminalFontId) => void;
  setFontSize: (size: TerminalFontSize) => void;
  setScrollback: (scrollback: TerminalScrollback) => void;
  setCursorStyle: (style: TerminalCursorStyle) => void;
  setCursorBlink: (blink: boolean) => void;
  setThemeId: (id: TerminalThemeId) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  // Keyboard size (only shown on mobile)
  keyboardSize?: KeyboardSizePreset;
  setKeyboardSize?: (size: KeyboardSizePreset) => void;
  isMobile?: boolean;
}

export function SettingsDropdown({
  fontId,
  fontSize,
  scrollback,
  cursorStyle,
  cursorBlink,
  themeId,
  setFontId,
  setFontSize,
  setScrollback,
  setCursorStyle,
  setCursorBlink,
  setThemeId,
  showSettings,
  setShowSettings,
  keyboardSize,
  setKeyboardSize,
  isMobile,
}: SettingsDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const closeDropdown = useCallback(
    () => setShowSettings(false),
    [setShowSettings],
  );
  const clickOutsideRefs = useMemo(() => [buttonRef, dropdownRef], []);

  // Close dropdown when clicking outside
  useClickOutside(clickOutsideRefs, closeDropdown, showSettings);

  // Calculate dropdown position - opens downward from button
  // Uses safe-area-inset for PWA/Chrome app title bars
  const [dropdownStyle, setDropdownStyle] =
    useState<React.CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (showSettings && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Get safe area inset (for PWA apps with title bars)
      const safeAreaTop = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue("--sat") ||
          "0",
        10,
      );
      // Add extra buffer for PWA title bars (~32px typical)
      const minTop = Math.max(safeAreaTop, 8);
      const calculatedTop = rect.bottom + 4;
      const top = Math.max(minTop, calculatedTop);

      setDropdownStyle({
        position: "fixed",
        right: window.innerWidth - rect.right,
        top,
        zIndex: 10001,
      });
    } else {
      setDropdownStyle(null);
    }
  }, [showSettings]);

  return (
    <div className="relative ml-2">
      <button
        ref={buttonRef}
        onClick={() => setShowSettings(!showSettings)}
        title="Terminal settings"
        className="p-1.5 rounded-md transition-all duration-150"
        style={{
          backgroundColor: showSettings
            ? "var(--term-bg-elevated)"
            : "transparent",
          color: showSettings ? "var(--term-accent)" : "var(--term-text-muted)",
          boxShadow: showSettings ? "0 0 8px var(--term-accent-glow)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!showSettings) {
            e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
            e.currentTarget.style.color = "var(--term-text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!showSettings) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--term-text-muted)";
          }
        }}
      >
        <Settings2 className="w-4 h-4" />
      </button>

      {/* Settings dropdown - glass-morphism style */}
      {/* Only render when position is calculated to avoid flash at wrong position */}
      {showSettings && dropdownStyle && (
        <div
          ref={dropdownRef}
          style={{
            ...dropdownStyle,
            backgroundColor: "rgba(21, 27, 35, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--term-border-active)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)",
          }}
          className="rounded-lg p-4 min-w-[220px] animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Font family */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Font Family
            </label>
            <select
              value={fontId}
              onChange={(e) => setFontId(e.target.value as TerminalFontId)}
              className="w-full px-2.5 py-2 text-sm rounded-md transition-colors focus:outline-none"
              style={{
                backgroundColor: "var(--term-bg-deep)",
                border: "1px solid var(--term-border)",
                color: "var(--term-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--term-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--term-border)";
              }}
            >
              {TERMINAL_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Font Size
            </label>
            <select
              value={fontSize}
              onChange={(e) =>
                setFontSize(Number(e.target.value) as TerminalFontSize)
              }
              className="w-full px-2.5 py-2 text-sm rounded-md transition-colors focus:outline-none"
              style={{
                backgroundColor: "var(--term-bg-deep)",
                border: "1px solid var(--term-border)",
                color: "var(--term-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--term-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--term-border)";
              }}
            >
              {TERMINAL_FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Theme
            </label>
            <select
              value={themeId}
              onChange={(e) => setThemeId(e.target.value as TerminalThemeId)}
              className="w-full px-2.5 py-2 text-sm rounded-md transition-colors focus:outline-none"
              style={{
                backgroundColor: "var(--term-bg-deep)",
                border: "1px solid var(--term-border)",
                color: "var(--term-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--term-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--term-border)";
              }}
            >
              {Object.entries(TERMINAL_THEMES).map(([id, { name }]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Cursor Style */}
          <div className="mb-4">
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Cursor Style
            </label>
            <div className="flex gap-1.5">
              {TERMINAL_CURSOR_STYLES.map((style) => {
                const isActive = cursorStyle === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setCursorStyle(style)}
                    className="flex-1 px-2 py-1.5 text-xs rounded-md transition-all duration-150 capitalize"
                    style={{
                      backgroundColor: isActive
                        ? "var(--term-accent)"
                        : "var(--term-bg-deep)",
                      color: isActive
                        ? "var(--term-bg-deep)"
                        : "var(--term-text-muted)",
                      border: `1px solid ${isActive ? "var(--term-accent)" : "var(--term-border)"}`,
                      boxShadow: isActive
                        ? "0 0 8px var(--term-accent-glow)"
                        : "none",
                    }}
                  >
                    {style}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cursor Blink */}
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cursorBlink}
                onChange={(e) => setCursorBlink(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{
                  accentColor: "var(--term-accent)",
                }}
              />
              <span
                className="text-xs font-medium"
                style={{ color: "var(--term-text-muted)" }}
              >
                Cursor Blink
              </span>
            </label>
          </div>

          {/* Scrollback */}
          <div className={isMobile && keyboardSize !== undefined ? "mb-4" : ""}>
            <label
              className="block text-xs font-medium mb-1.5"
              style={{ color: "var(--term-text-muted)" }}
            >
              Scrollback Buffer
            </label>
            <select
              value={scrollback}
              onChange={(e) =>
                setScrollback(Number(e.target.value) as TerminalScrollback)
              }
              className="w-full px-2.5 py-2 text-sm rounded-md transition-colors focus:outline-none"
              style={{
                backgroundColor: "var(--term-bg-deep)",
                border: "1px solid var(--term-border)",
                color: "var(--term-text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--term-accent)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--term-border)";
              }}
            >
              {TERMINAL_SCROLLBACK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Keyboard size - only on mobile */}
          {isMobile && keyboardSize !== undefined && setKeyboardSize && (
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--term-text-muted)" }}
              >
                Keyboard Size
              </label>
              <div className="flex gap-1.5">
                {(["small", "medium", "large"] as const).map((size) => {
                  const isActive = keyboardSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setKeyboardSize(size)}
                      className="flex-1 px-2 py-1.5 text-xs rounded-md transition-all duration-150 capitalize"
                      style={{
                        backgroundColor: isActive
                          ? "var(--term-accent)"
                          : "var(--term-bg-deep)",
                        color: isActive
                          ? "var(--term-bg-deep)"
                          : "var(--term-text-muted)",
                        border: `1px solid ${isActive ? "var(--term-accent)" : "var(--term-border)"}`,
                        boxShadow: isActive
                          ? "0 0 8px var(--term-accent-glow)"
                          : "none",
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

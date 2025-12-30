"use client";

import { useCallback, useRef, useMemo, useState } from "react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { clsx } from "clsx";
import { Settings2, FolderKanban } from "lucide-react";
import {
  TERMINAL_FONTS,
  TERMINAL_FONT_SIZES,
  TerminalFontId,
  TerminalFontSize,
} from "@/lib/hooks/use-terminal-settings";
import { TerminalManagerModal } from "./TerminalManagerModal";

// Keyboard size type
export type KeyboardSizePreset = "small" | "medium" | "large";

export interface SettingsDropdownProps {
  fontId: TerminalFontId;
  fontSize: TerminalFontSize;
  setFontId: (id: TerminalFontId) => void;
  setFontSize: (size: TerminalFontSize) => void;
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
  setFontId,
  setFontSize,
  showSettings,
  setShowSettings,
  keyboardSize,
  setKeyboardSize,
  isMobile,
}: SettingsDropdownProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const closeDropdown = useCallback(
    () => setShowSettings(false),
    [setShowSettings]
  );
  const clickOutsideRefs = useMemo(() => [buttonRef, dropdownRef], []);

  // Close dropdown when clicking outside
  useClickOutside(clickOutsideRefs, closeDropdown, showSettings);

  // Calculate dropdown position - opens downward from button
  const getDropdownStyle = (): React.CSSProperties => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      position: "fixed",
      right: window.innerWidth - rect.right,
      top: rect.bottom + 4,
      zIndex: 9999,
    };
  };

  return (
    <div className="relative ml-2">
      <button
        ref={buttonRef}
        onClick={() => setShowSettings(!showSettings)}
        title="Terminal settings"
        className="p-1.5 rounded-md transition-all duration-150"
        style={{
          backgroundColor: showSettings ? "var(--term-bg-elevated)" : "transparent",
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
      {showSettings && (
        <div
          ref={dropdownRef}
          style={{
            ...getDropdownStyle(),
            backgroundColor: "rgba(21, 27, 35, 0.85)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid var(--term-border-active)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.1)",
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
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--term-accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--term-border)"; }}
            >
              {TERMINAL_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className={isMobile && keyboardSize !== undefined ? "mb-4" : ""}>
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
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--term-accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--term-border)"; }}
            >
              {TERMINAL_FONT_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </div>

          {/* Keyboard size - only on mobile */}
          {isMobile && keyboardSize !== undefined && setKeyboardSize && (
            <div className="mb-4">
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
                        backgroundColor: isActive ? "var(--term-accent)" : "var(--term-bg-deep)",
                        color: isActive ? "var(--term-bg-deep)" : "var(--term-text-muted)",
                        border: `1px solid ${isActive ? "var(--term-accent)" : "var(--term-border)"}`,
                        boxShadow: isActive ? "0 0 8px var(--term-accent-glow)" : "none",
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Terminal Projects button */}
          <div style={{ borderTop: "1px solid var(--term-border)", paddingTop: "12px", marginTop: "4px" }}>
            <button
              onClick={() => {
                setShowProjectSettings(true);
                setShowSettings(false);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md transition-colors"
              style={{
                backgroundColor: "transparent",
                color: "var(--term-text-muted)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--term-bg-deep)";
                e.currentTarget.style.color = "var(--term-text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--term-text-muted)";
              }}
            >
              <FolderKanban size={16} />
              <span>Terminal Projects</span>
            </button>
          </div>
        </div>
      )}

      {/* Terminal Manager Modal */}
      <TerminalManagerModal
        isOpen={showProjectSettings}
        onClose={() => setShowProjectSettings(false)}
        onCreateGenericTerminal={() => {
          // This will be handled by TerminalTabs in phase 7
          console.log("Create generic terminal requested");
        }}
      />
    </div>
  );
}

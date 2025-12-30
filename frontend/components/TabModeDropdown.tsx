"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { ChevronDown, Terminal, Sparkles } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

export type TerminalMode = "shell" | "claude";

interface TabModeDropdownProps {
  value: TerminalMode;
  onChange: (mode: TerminalMode) => void;
  disabled?: boolean;
  isMobile?: boolean;
}

/**
 * Dropdown for switching between Shell and Claude modes.
 * Used in project tabs and split pane headers.
 */
export function TabModeDropdown({
  value,
  onChange,
  disabled = false,
  isMobile = false,
}: TabModeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const closeDropdown = useCallback(() => setIsOpen(false), []);
  const clickOutsideRefs = useMemo(() => [buttonRef, dropdownRef], []);
  useClickOutside(clickOutsideRefs, closeDropdown, isOpen);

  // Calculate dropdown position based on viewport - use fixed positioning
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 88; // Approximate height of 2 options
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < dropdownHeight;

    setDropdownStyle({
      position: "fixed",
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      right: window.innerWidth - rect.right,
      zIndex: 9999,
    });
  }, [isOpen]);

  const handleSelect = (mode: TerminalMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  // Touch target sizing
  const touchTargetClass = isMobile ? "min-h-[44px] min-w-[44px]" : "";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          flex items-center gap-1 rounded transition-all duration-150
          ${isMobile ? "px-2 py-2" : "px-1.5 py-1"}
          ${touchTargetClass}
        `}
        style={{
          backgroundColor: isOpen ? "var(--term-bg-deep)" : "transparent",
          color: disabled ? "var(--term-text-muted)" : "var(--term-text-primary)",
          border: isOpen ? "1px solid var(--term-border-active)" : "1px solid transparent",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor = "var(--term-bg-deep)";
            e.currentTarget.style.borderColor = "var(--term-border)";
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }
        }}
        title={`Current mode: ${value}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {/* Mode indicator icon */}
        {value === "claude" ? (
          <Sparkles className="w-3 h-3" style={{ color: "var(--term-accent)" }} />
        ) : (
          <Terminal className="w-3 h-3" style={{ color: "var(--term-text-muted)" }} />
        )}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--term-text-muted)" }}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <>
          {/* Invisible overlay to capture clicks */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
            }}
          />

          <div
            ref={dropdownRef}
            role="listbox"
            className="min-w-[100px] rounded-md overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100"
            style={{
              ...dropdownStyle,
              backgroundColor: "rgba(21, 27, 35, 0.95)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--term-border-active)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ModeOption
              mode="shell"
              isSelected={value === "shell"}
              onClick={() => handleSelect("shell")}
              isMobile={isMobile}
            />
            <ModeOption
              mode="claude"
              isSelected={value === "claude"}
              onClick={() => handleSelect("claude")}
              isMobile={isMobile}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ModeOption({
  mode,
  isSelected,
  onClick,
  isMobile,
}: {
  mode: TerminalMode;
  isSelected: boolean;
  onClick: () => void;
  isMobile: boolean;
}) {
  return (
    <button
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      className={`
        flex items-center gap-2 w-full text-left transition-colors
        ${isMobile ? "px-3 py-3 text-sm min-h-[44px]" : "px-2.5 py-2 text-xs"}
      `}
      style={{
        color: isSelected ? "var(--term-accent)" : "var(--term-text-primary)",
        backgroundColor: "transparent",
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {mode === "claude" ? (
        <Sparkles className="w-3.5 h-3.5" style={{ color: isSelected ? "var(--term-accent)" : "var(--term-text-muted)" }} />
      ) : (
        <Terminal className="w-3.5 h-3.5" style={{ color: isSelected ? "var(--term-accent)" : "var(--term-text-muted)" }} />
      )}
      <span>{mode === "claude" ? "Claude" : "Shell"}</span>
      {isSelected && (
        <span className="ml-auto" style={{ color: "var(--term-accent)" }}>✓</span>
      )}
    </button>
  );
}

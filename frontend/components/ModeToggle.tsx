"use client";

import { useState, useCallback } from "react";
import { Terminal, Sparkles, Loader2 } from "lucide-react";

export type TerminalMode = "shell" | "claude";

interface ModeToggleProps {
  value: TerminalMode;
  onChange: (mode: TerminalMode) => void | Promise<void>;
  disabled?: boolean;
  isMobile?: boolean;
  /** External loading state - when true, toggle is disabled and shows spinner */
  isLoading?: boolean;
}

/**
 * Single-click toggle for switching between Shell and Claude modes.
 * Replaces TabModeDropdown with a simpler one-click interaction.
 */
export function ModeToggle({
  value,
  onChange,
  disabled = false,
  isMobile = false,
  isLoading = false,
}: ModeToggleProps) {
  const [internalLoading, setInternalLoading] = useState(false);

  // Combined loading state - either external or internal
  const isCurrentlyLoading = isLoading || internalLoading;

  // Combined disabled state
  const isDisabled = disabled || isCurrentlyLoading;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (isDisabled) return;

      const oppositeMode: TerminalMode = value === "shell" ? "claude" : "shell";

      setInternalLoading(true);
      try {
        await onChange(oppositeMode);
      } catch (error) {
        console.error("Failed to switch mode:", error);
      } finally {
        setInternalLoading(false);
      }
    },
    [value, onChange, isDisabled],
  );

  // Touch target sizing
  const touchTargetClass = isMobile ? "min-h-[44px] min-w-[44px]" : "";

  const tooltipText = isCurrentlyLoading
    ? "Switching mode..."
    : value === "shell"
      ? "Shell mode - click to switch to Claude"
      : "Claude mode - click to switch to Shell";

  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      className={`
        flex items-center justify-center rounded transition-all duration-150
        ${isMobile ? "p-2" : "p-1.5"}
        ${touchTargetClass}
      `}
      style={{
        backgroundColor: "transparent",
        color: isDisabled
          ? "var(--term-text-muted)"
          : "var(--term-text-primary)",
        border: "1px solid transparent",
        opacity: isDisabled ? 0.5 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.backgroundColor = "var(--term-bg-deep)";
          e.currentTarget.style.borderColor = "var(--term-border)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isDisabled) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.borderColor = "transparent";
        }
      }}
      title={tooltipText}
      aria-label={tooltipText}
      aria-busy={isCurrentlyLoading}
    >
      {isCurrentlyLoading ? (
        <Loader2
          className={isMobile ? "w-5 h-5" : "w-4 h-4"}
          style={{ color: "var(--term-accent)" }}
        />
      ) : value === "claude" ? (
        <Sparkles
          className={isMobile ? "w-5 h-5" : "w-4 h-4"}
          style={{ color: "var(--term-accent)" }}
        />
      ) : (
        <Terminal
          className={isMobile ? "w-5 h-5" : "w-4 h-4"}
          style={{ color: "var(--term-text-muted)" }}
        />
      )}
    </button>
  );
}

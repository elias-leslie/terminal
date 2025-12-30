"use client";

type ClaudeState = "none" | "active" | "idle";

interface ClaudeIndicatorProps {
  state: ClaudeState;
  className?: string;
}

/**
 * Visual indicator for Claude Code status.
 *
 * States:
 * - none: Just a dim dot (shell only)
 * - idle: Ring with static glow (Claude session exists but user in base shell)
 * - active: Ring with breathing animation (Claude session active)
 */
export function ClaudeIndicator({ state, className = "" }: ClaudeIndicatorProps) {
  return (
    <div className={`flex items-center justify-center w-3 h-3 ${className}`}>
      {state === "none" ? (
        // Dim dot for shell-only
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{
            backgroundColor: "var(--term-text-muted)",
            opacity: 0.5,
          }}
        />
      ) : (
        // Ring for Claude (idle or active)
        <div
          className={`w-2.5 h-2.5 rounded-full ${state === "active" ? "claude-indicator-active" : ""}`}
          style={{
            border: "2px solid var(--term-accent)",
            backgroundColor: "transparent",
            boxShadow: state === "active" ? "0 0 6px var(--term-accent)" : "0 0 4px var(--term-accent)",
          }}
        />
      )}

      {/* Keyframes for breathing animation */}
      <style jsx>{`
        @keyframes claude-breathe {
          0%, 100% {
            opacity: 0.6;
            box-shadow: 0 0 4px var(--term-accent);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 12px var(--term-accent);
          }
        }

        .claude-indicator-active {
          animation: claude-breathe 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

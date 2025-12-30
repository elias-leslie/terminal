"use client";

import { Sparkles, Loader2 } from "lucide-react";

interface ClaudeLoadingOverlayProps {
  variant?: "normal" | "compact";
}

export function ClaudeLoadingOverlay({ variant = "normal" }: ClaudeLoadingOverlayProps) {
  const isCompact = variant === "compact";

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center z-20"
      style={{ backgroundColor: "var(--term-bg-deep)" }}
    >
      <div className={`flex items-center ${isCompact ? "gap-2 mb-2" : "gap-3 mb-4"}`}>
        <Sparkles
          className={`${isCompact ? "w-5 h-5" : "w-8 h-8"} animate-pulse`}
          style={{ color: "var(--term-accent)" }}
        />
        <span
          className={`${isCompact ? "text-sm" : "text-lg"} font-medium`}
          style={{ color: "var(--term-text-primary)" }}
        >
          Starting Claude...
        </span>
      </div>
      {!isCompact && (
        <div className="flex items-center gap-2">
          <Loader2
            className="w-4 h-4 animate-spin"
            style={{ color: "var(--term-text-muted)" }}
          />
          <span
            className="text-sm"
            style={{ color: "var(--term-text-muted)" }}
          >
            Initializing Claude Code
          </span>
        </div>
      )}
      {isCompact && (
        <Loader2
          className="w-4 h-4 animate-spin"
          style={{ color: "var(--term-text-muted)" }}
        />
      )}
    </div>
  );
}

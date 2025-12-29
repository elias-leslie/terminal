"use client";

import { clsx } from "clsx";
import { Square, Rows2, Columns2, LucideIcon } from "lucide-react";

// Define LayoutMode locally for standalone terminal app
export type LayoutMode = "single" | "horizontal" | "vertical";

const LAYOUT_BUTTONS: { mode: LayoutMode; icon: LucideIcon; title: string }[] = [
  { mode: "single", icon: Square, title: "Single pane" },
  { mode: "horizontal", icon: Rows2, title: "Horizontal split" },
  { mode: "vertical", icon: Columns2, title: "Vertical split" },
];

interface LayoutModeButtonsProps {
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
}

export function LayoutModeButtons({ layoutMode, onLayoutChange }: LayoutModeButtonsProps) {
  return (
    <>
      {LAYOUT_BUTTONS.map(({ mode, icon: Icon, title }) => {
        const isActive = layoutMode === mode;
        return (
          <button
            key={mode}
            onClick={() => onLayoutChange(mode)}
            title={title}
            className="p-1.5 rounded-md transition-all duration-150"
            style={{
              backgroundColor: isActive ? "var(--term-bg-elevated)" : "transparent",
              color: isActive ? "var(--term-accent)" : "var(--term-text-muted)",
              boxShadow: isActive ? "0 0 8px var(--term-accent-glow)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
                e.currentTarget.style.color = "var(--term-text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--term-text-muted)";
              }
            }}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </>
  );
}

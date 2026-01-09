"use client";

import { memo } from "react";
import { clsx } from "clsx";
import {
  Settings,
  RefreshCw,
  X,
  Paperclip,
  Sparkles,
  GripVertical,
  ChevronDown,
  Plus,
} from "lucide-react";
import { LayoutMode, LayoutModeButtons } from "./LayoutModeButton";
import { ModeToggle, TerminalMode } from "./ModeToggle";
import { type TerminalSlot, getSlotName } from "@/lib/utils/slot";

export interface UnifiedTerminalHeaderProps {
  slot: TerminalSlot;
  isActive?: boolean;
  layoutMode?: LayoutMode;
  availableLayouts?: LayoutMode[];
  showCleanButton?: boolean;
  showLayoutSelector?: boolean;
  isDraggable?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragAttributes?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragListeners?: any;
  onSwitch?: () => void;
  onLayout?: (mode: LayoutMode) => void;
  onSettings?: () => void;
  onReset?: () => void;
  onClose?: () => void;
  onUpload?: () => void;
  onClean?: () => void;
  /** Opens terminal manager modal - appears in ALL pane headers */
  onOpenModal?: () => void;
  /** Whether new panes can be added (at limit = false) */
  canAddPane?: boolean;
  /** Callback for mode switch (shell <-> claude) - only for project slots */
  onModeSwitch?: (mode: TerminalMode) => void | Promise<void>;
  /** Whether mode switch is in progress */
  isModeSwitching?: boolean;
  isMobile?: boolean;
}

export const UnifiedTerminalHeader = memo(function UnifiedTerminalHeader({
  slot,
  isActive = false,
  layoutMode,
  availableLayouts,
  showCleanButton = false,
  showLayoutSelector = false,
  isDraggable = false,
  dragAttributes,
  dragListeners,
  onSwitch,
  onLayout,
  onSettings,
  onReset,
  onClose,
  onUpload,
  onClean,
  onOpenModal,
  canAddPane = true,
  onModeSwitch,
  isModeSwitching = false,
  isMobile = false,
}: UnifiedTerminalHeaderProps) {
  const name = getSlotName(slot);
  const isClaudeMode = slot.type === "project" && slot.activeMode === "claude";

  // Show clean button for claude mode
  const shouldShowClean = showCleanButton && isClaudeMode;

  return (
    <div
      className={clsx(
        "flex-shrink-0 flex items-center gap-1",
        isMobile ? "h-9 px-1.5" : "h-8 px-2",
      )}
      style={{
        backgroundColor: isActive
          ? "var(--term-bg-elevated)"
          : "var(--term-bg-surface)",
        borderBottom: "1px solid var(--term-border)",
      }}
    >
      {/* Drag handle (for grid/split modes) */}
      {isDraggable && (
        <button
          className="p-0.5 cursor-grab active:cursor-grabbing rounded opacity-50 hover:opacity-100 hover:bg-[var(--term-bg-elevated)] transition-all duration-150"
          {...dragAttributes}
          {...dragListeners}
          aria-label="Drag to reorder"
        >
          <GripVertical
            className="w-3.5 h-3.5"
            style={{ color: "var(--term-text-muted)" }}
          />
        </button>
      )}

      {/* Mode toggle (shell <-> claude) - only for project slots */}
      {slot.type === "project" && onModeSwitch && (
        <ModeToggle
          value={slot.activeMode}
          onChange={onModeSwitch}
          disabled={isModeSwitching}
          isLoading={isModeSwitching}
          isMobile={isMobile}
        />
      )}

      {/* Terminal name/switcher */}
      {onSwitch ? (
        <button
          onClick={onSwitch}
          className={clsx(
            "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate max-w-[140px] transition-all duration-150",
            "hover:bg-[var(--term-bg-elevated)]",
          )}
          style={{
            color: isActive
              ? "var(--term-text-primary)"
              : "var(--term-text-muted)",
          }}
          title={name}
        >
          <span className="truncate">{name}</span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
      ) : (
        <span
          className="flex items-center px-1.5 py-0.5 text-xs truncate max-w-[140px]"
          style={{
            color: isActive
              ? "var(--term-text-primary)"
              : "var(--term-text-muted)",
          }}
          title={name}
        >
          {name}
        </span>
      )}

      {/* Add terminal button - appears in ALL pane headers */}
      {onOpenModal && (
        <button
          onClick={onOpenModal}
          disabled={!canAddPane}
          className={clsx(
            "flex items-center justify-center rounded ml-1 transition-all duration-150",
            isMobile ? "w-7 h-7" : "w-5 h-5",
            !canAddPane && "opacity-50 cursor-not-allowed",
          )}
          style={{
            backgroundColor: "var(--term-bg-surface)",
            border: "1px solid var(--term-border)",
            color: "var(--term-text-muted)",
          }}
          onMouseEnter={(e) => {
            if (canAddPane) {
              e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
              e.currentTarget.style.borderColor = "var(--term-accent)";
              e.currentTarget.style.color = "var(--term-accent)";
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
            e.currentTarget.style.borderColor = "var(--term-border)";
            e.currentTarget.style.color = "var(--term-text-muted)";
          }}
          title={canAddPane ? "Open terminal" : "Maximum 4 terminals"}
          aria-label={canAddPane ? "Open terminal" : "Maximum 4 terminals"}
        >
          <Plus className={isMobile ? "w-4 h-4" : "w-3 h-3"} />
        </button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Layout selector (single mode only) */}
      {showLayoutSelector &&
        layoutMode &&
        availableLayouts &&
        onLayout &&
        !isMobile && (
          <div className="flex items-center gap-0.5 mr-1">
            <LayoutModeButtons
              layoutMode={layoutMode}
              onLayoutChange={onLayout}
              availableLayouts={availableLayouts}
            />
          </div>
        )}

      {/* Action buttons */}
      <div className="flex items-center gap-0.5">
        {/* Prompt cleaner (claude mode only) */}
        {shouldShowClean && onClean && (
          <IconButton
            icon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={onClean}
            tooltip="Clean prompt"
            isMobile={isMobile}
          />
        )}

        {/* Upload */}
        {onUpload && (
          <IconButton
            icon={<Paperclip className="w-3.5 h-3.5" />}
            onClick={onUpload}
            tooltip="Upload file"
            isMobile={isMobile}
          />
        )}

        {/* Settings */}
        {onSettings && (
          <IconButton
            icon={<Settings className="w-3.5 h-3.5" />}
            onClick={onSettings}
            tooltip="Settings"
            isMobile={isMobile}
          />
        )}

        {/* Reset */}
        {onReset && (
          <IconButton
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={onReset}
            tooltip="Reset terminal"
            isMobile={isMobile}
          />
        )}

        {/* Close */}
        {onClose && (
          <IconButton
            icon={<X className="w-3.5 h-3.5" />}
            onClick={onClose}
            tooltip="Close terminal"
            variant="danger"
            isMobile={isMobile}
          />
        )}
      </div>
    </div>
  );
});

// Internal icon button component
interface IconButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
  tooltip: string;
  variant?: "default" | "danger";
  isMobile?: boolean;
}

function IconButton({
  icon,
  onClick,
  tooltip,
  variant = "default",
  isMobile,
}: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center justify-center rounded transition-all duration-150",
        isMobile ? "w-8 h-8" : "w-6 h-6",
      )}
      style={{
        color:
          variant === "danger" ? "var(--term-error)" : "var(--term-text-muted)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
        if (variant === "default") {
          e.currentTarget.style.color = "var(--term-accent)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color =
          variant === "danger" ? "var(--term-error)" : "var(--term-text-muted)";
      }}
      title={tooltip}
    >
      {icon}
    </button>
  );
}

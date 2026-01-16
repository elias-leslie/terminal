"use client";

import { useState, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { MoreVertical, RefreshCw, XCircle } from "lucide-react";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { ConfirmationDialog } from "./ConfirmationDialog";

interface GlobalActionMenuProps {
  onResetAll: () => void;
  onCloseAll: () => void;
  isMobile?: boolean;
}

/**
 * Global action menu for terminal tab bar.
 * Provides "Reset All Terminals" and "Close All Terminals" options.
 * Positioned next to settings icon.
 */
export function GlobalActionMenu({
  onResetAll,
  onCloseAll,
  isMobile = false,
}: GlobalActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const [confirmAction, setConfirmAction] = useState<{
    type: "reset" | "close";
    onConfirm: () => void;
  } | null>(null);

  const closeMenu = useCallback(() => setIsOpen(false), []);
  const clickOutsideRefs = useMemo(() => [buttonRef, menuRef], []);
  useClickOutside(clickOutsideRefs, closeMenu, isOpen);

  // Calculate menu position based on viewport - use fixed positioning
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const menuHeight = 88; // Approximate height of 2 options
    const menuWidth = 180;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceRight = window.innerWidth - rect.right;
    const openAbove = spaceBelow < menuHeight;
    const openLeft = spaceRight < menuWidth;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Intentional: position must be calculated from DOM before paint
    setMenuStyle({
      position: "fixed",
      top: openAbove ? undefined : rect.bottom + 4,
      bottom: openAbove ? window.innerHeight - rect.top + 4 : undefined,
      right: openLeft ? window.innerWidth - rect.right : undefined,
      left: openLeft ? undefined : rect.left,
      zIndex: 9999,
    });
  }, [isOpen]);

  const handleResetAll = () => {
    setConfirmAction({
      type: "reset",
      onConfirm: () => {
        onResetAll();
        setConfirmAction(null);
      },
    });
    setIsOpen(false);
  };

  const handleCloseAll = () => {
    setConfirmAction({
      type: "close",
      onConfirm: () => {
        onCloseAll();
        setConfirmAction(null);
      },
    });
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Touch target sizing
  const touchTargetClass = isMobile ? "min-h-[44px] min-w-[44px]" : "";

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        data-testid="global-action-menu"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        onKeyDown={handleKeyDown}
        className={`
          flex items-center justify-center rounded-md transition-all duration-150
          ${isMobile ? "p-2" : "p-1.5"}
          ${touchTargetClass}
        `}
        style={{
          backgroundColor: isOpen ? "var(--term-bg-elevated)" : "transparent",
          color: isOpen ? "var(--term-accent)" : "var(--term-text-muted)",
          boxShadow: isOpen ? "0 0 8px var(--term-accent-glow)" : "none",
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = "var(--term-bg-elevated)";
            e.currentTarget.style.color = "var(--term-text-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--term-text-muted)";
          }
        }}
        title="Global actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreVertical className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
      </button>

      {/* Menu */}
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
            ref={menuRef}
            data-testid="global-action-menu-items"
            role="menu"
            className="min-w-[160px] rounded-md overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100"
            style={{
              ...menuStyle,
              backgroundColor: "rgba(21, 27, 35, 0.95)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--term-border-active)",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <GlobalMenuItem
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              label="Reset All Terminals"
              onClick={handleResetAll}
              isMobile={isMobile}
            />
            <GlobalMenuItem
              icon={<XCircle className="w-3.5 h-3.5" />}
              label="Close All Terminals"
              onClick={handleCloseAll}
              isMobile={isMobile}
              variant="danger"
            />
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmAction !== null}
        title={
          confirmAction?.type === "reset"
            ? "Reset All Terminals?"
            : "Close All Terminals?"
        }
        message={
          confirmAction?.type === "reset"
            ? "This will clear all terminal history. Your sessions will remain active but output will be lost."
            : "This will terminate all active terminal sessions. Any running processes will be stopped."
        }
        confirmText={
          confirmAction?.type === "reset" ? "Reset All" : "Close All"
        }
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => confirmAction?.onConfirm()}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function GlobalMenuItem({
  icon,
  label,
  onClick,
  isMobile,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isMobile: boolean;
  variant?: "default" | "danger";
}) {
  const colorVar =
    variant === "danger" ? "var(--term-error)" : "var(--term-text-primary)";
  const hoverColorVar =
    variant === "danger" ? "var(--term-error)" : "var(--term-accent)";

  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`
        flex items-center gap-2 w-full text-left transition-colors
        ${isMobile ? "px-3 py-3 text-sm min-h-[44px]" : "px-2.5 py-2 text-xs"}
      `}
      style={{
        color: colorVar,
        backgroundColor: "transparent",
        fontFamily: "var(--font-mono)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--term-bg-surface)";
        e.currentTarget.style.color = hoverColorVar;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = colorVar;
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

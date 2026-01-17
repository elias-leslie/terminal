'use client'

import { clsx } from 'clsx'
import { MoreHorizontal, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface PaneOverflowMenuProps {
  onResetAll?: () => void
  onCloseAll?: () => void
  isMobile?: boolean
}

/**
 * Overflow menu (...) for global pane actions: Reset All, Close All.
 * Appears in pane headers since there's no main header bar.
 */
export function PaneOverflowMenu({
  onResetAll,
  onCloseAll,
  isMobile = false,
}: PaneOverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close menu on escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  const handleResetAll = useCallback(() => {
    onResetAll?.()
    setIsOpen(false)
  }, [onResetAll])

  const handleCloseAll = useCallback(() => {
    onCloseAll?.()
    setIsOpen(false)
  }, [onCloseAll])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        data-testid="pane-overflow-menu"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center justify-center rounded transition-all duration-150',
          isMobile ? 'w-8 h-8' : 'w-6 h-6',
        )}
        style={{ color: 'var(--term-text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--term-bg-elevated)'
          e.currentTarget.style.color = 'var(--term-accent)'
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--term-text-muted)'
          }
        }}
        title="More actions"
        aria-label="More actions"
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          data-testid="pane-overflow-menu-items"
          className="absolute right-0 top-full mt-1 z-50 min-w-[140px] py-1 rounded-md shadow-lg"
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            border: '1px solid var(--term-border)',
          }}
        >
          {onResetAll && (
            <MenuItem
              icon={<RefreshCw className="w-3.5 h-3.5" />}
              label="Reset All"
              onClick={handleResetAll}
            />
          )}
          {onCloseAll && (
            <MenuItem
              icon={<X className="w-3.5 h-3.5" />}
              label="Close All"
              onClick={handleCloseAll}
              variant="danger"
            />
          )}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
}

function MenuItem({
  icon,
  label,
  onClick,
  variant = 'default',
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors hover:bg-[var(--term-bg-surface)]"
      style={{
        color:
          variant === 'danger' ? 'var(--term-error)' : 'var(--term-text-muted)',
      }}
      onMouseEnter={(e) => {
        if (variant === 'default') {
          e.currentTarget.style.color = 'var(--term-text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color =
          variant === 'danger' ? 'var(--term-error)' : 'var(--term-text-muted)'
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

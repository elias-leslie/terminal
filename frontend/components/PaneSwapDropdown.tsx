'use client'

import { clsx } from 'clsx'
import { ArrowLeftRight, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  getSlotName,
  getSlotPanelId,
  type TerminalSlot,
} from '@/lib/utils/slot'

export interface PaneSwapDropdownProps {
  /** Current slot being displayed */
  currentSlot: TerminalSlot
  /** All available slots for swapping */
  allSlots: TerminalSlot[]
  /** Callback when user selects another slot to swap with */
  onSwapWith: (otherSlotId: string) => void
  isMobile?: boolean
}

/**
 * Dropdown for swapping pane positions in split/grid mode.
 * Shows current pane name with chevron; clicking opens dropdown of other panes.
 * Selecting another pane triggers a position swap.
 */
export function PaneSwapDropdown({
  currentSlot,
  allSlots,
  onSwapWith,
  isMobile = false,
}: PaneSwapDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const currentName = getSlotName(currentSlot)
  const currentId = getSlotPanelId(currentSlot)

  // Other slots to show in dropdown (exclude current)
  const otherSlots = allSlots.filter((s) => getSlotPanelId(s) !== currentId)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Don't show dropdown if there's nothing to swap with
  if (otherSlots.length === 0) {
    return (
      <span
        className="flex items-center px-1.5 py-0.5 text-xs truncate max-w-[140px]"
        style={{ color: 'var(--term-text-primary)' }}
        title={currentName}
      >
        {currentName}
      </span>
    )
  }

  return (
    <div ref={dropdownRef} className="relative flex items-center gap-1">
      {/* Trigger button */}
      <button
        data-testid="pane-swap-dropdown"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate max-w-[140px] transition-all duration-150',
          'hover:bg-[var(--term-bg-elevated)]',
        )}
        style={{
          color: 'var(--term-text-primary)',
        }}
        title={`${currentName} (click to swap position)`}
      >
        <span className="truncate">{currentName}</span>
        <ChevronDown
          className={clsx(
            'w-3 h-3 flex-shrink-0 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown showing other panes */}
      {isOpen && (
        <div
          data-testid="pane-swap-dropdown-menu"
          className={clsx(
            'absolute left-0 top-full mt-1 z-50 rounded-md shadow-lg overflow-hidden',
            isMobile ? 'min-w-[200px]' : 'min-w-[180px]',
          )}
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            border: '1px solid var(--term-border)',
          }}
        >
          {/* Header */}
          <div
            className="px-2 py-1.5 text-[10px] uppercase tracking-wide flex items-center gap-1"
            style={{
              color: 'var(--term-text-muted)',
              backgroundColor: 'var(--term-bg-surface)',
            }}
          >
            <ArrowLeftRight className="w-3 h-3" />
            Swap position with
          </div>

          {/* Other panes */}
          {otherSlots.map((slot) => {
            const slotId = getSlotPanelId(slot)
            const slotName = getSlotName(slot)
            return (
              <button
                key={slotId}
                onClick={() => {
                  onSwapWith(slotId)
                  setIsOpen(false)
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                style={{
                  color: 'var(--term-text-primary)',
                }}
              >
                <ArrowLeftRight
                  className="w-3 h-3 flex-shrink-0"
                  style={{ color: 'var(--term-text-muted)' }}
                />
                <span className="truncate flex-1">{slotName}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { clsx } from 'clsx'
import { Check, ChevronDown, Terminal as TerminalIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getSlotName, getSlotSessionId, type PaneSlot } from '@/lib/utils/slot'
import { ClaudeIndicator } from './ClaudeIndicator'

export interface TerminalSwitcherProps {
  /** Currently active slot (for display and selection indicator) */
  activeSlot: PaneSlot | null
  /** All available terminal slots (derived from panes) */
  slots: PaneSlot[]
  /** Called when user selects a slot */
  onSelectSlot: (slot: PaneSlot) => void
  isMobile?: boolean
}

/**
 * Dropdown for switching between terminals in single-view mode.
 * Uses pane-based slots as the source of truth.
 */
export function TerminalSwitcher({
  activeSlot,
  slots,
  onSelectSlot,
  isMobile = false,
}: TerminalSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // Separate project slots and ad-hoc slots
  const projectSlots = useMemo(() => {
    return slots
      .filter((s) => s.type === 'project')
      .sort((a, b) => {
        if (a.type !== 'project' || b.type !== 'project') return 0
        return a.projectName.localeCompare(b.projectName)
      })
  }, [slots])

  const adHocSlots = useMemo(() => {
    return slots
      .filter((s) => s.type === 'adhoc')
      .sort((a, b) => {
        if (a.type !== 'adhoc' || b.type !== 'adhoc') return 0
        return a.name.localeCompare(b.name)
      })
  }, [slots])

  // Get current display info
  const currentName = activeSlot ? getSlotName(activeSlot) : 'Terminal'
  const currentMode =
    activeSlot?.type === 'project' ? activeSlot.activeMode : undefined
  const activeSessionId = activeSlot ? getSlotSessionId(activeSlot) : null

  return (
    <div ref={dropdownRef} className="relative flex items-center gap-1">
      {/* Trigger button */}
      <button
        data-testid="terminal-switcher"
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate max-w-[140px] transition-all duration-150',
          'hover:bg-[var(--term-bg-elevated)]',
        )}
        style={{
          color: 'var(--term-text-primary)',
        }}
        title={currentName}
      >
        {currentMode === 'claude' ? (
          <ClaudeIndicator state="idle" />
        ) : (
          <TerminalIcon
            className="w-3 h-3 flex-shrink-0"
            style={{ color: 'var(--term-text-muted)' }}
          />
        )}
        <span className="truncate">{currentName}</span>
        <ChevronDown
          className={clsx(
            'w-3 h-3 flex-shrink-0 transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown - slot list */}
      {isOpen && (
        <div
          data-testid="terminal-switcher-menu"
          className={clsx(
            'absolute left-0 top-full mt-1 z-50 rounded-md shadow-lg overflow-hidden',
            isMobile ? 'min-w-[200px]' : 'min-w-[180px]',
          )}
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            border: '1px solid var(--term-border)',
          }}
        >
          {/* Projects section */}
          {projectSlots.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  color: 'var(--term-text-muted)',
                  backgroundColor: 'var(--term-bg-surface)',
                }}
              >
                Projects
              </div>
              {projectSlots.map((slot) => {
                if (slot.type !== 'project') return null
                const slotSessionId = getSlotSessionId(slot)
                const isSelected = slotSessionId === activeSessionId
                return (
                  <button
                    key={slot.paneId}
                    onClick={() => {
                      onSelectSlot(slot)
                      setIsOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                    style={{
                      color: isSelected
                        ? 'var(--term-accent)'
                        : 'var(--term-text-primary)',
                    }}
                  >
                    <ClaudeIndicator
                      state={slot.activeMode === 'claude' ? 'idle' : 'none'}
                    />
                    <span className="truncate flex-1">{slot.projectName}</span>
                    <span
                      className="text-[10px] px-1 rounded"
                      style={{
                        backgroundColor: 'var(--term-bg-surface)',
                        color: 'var(--term-text-muted)',
                      }}
                    >
                      {slot.activeMode}
                    </span>
                    {isSelected && (
                      <Check
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: 'var(--term-accent)' }}
                      />
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Ad-hoc section */}
          {adHocSlots.length > 0 && (
            <>
              <div
                className="px-2 py-1 text-[10px] uppercase tracking-wide"
                style={{
                  color: 'var(--term-text-muted)',
                  backgroundColor: 'var(--term-bg-surface)',
                }}
              >
                Terminals
              </div>
              {adHocSlots.map((slot) => {
                if (slot.type !== 'adhoc') return null
                const slotSessionId = getSlotSessionId(slot)
                const isSelected = slotSessionId === activeSessionId
                return (
                  <button
                    key={slot.paneId}
                    onClick={() => {
                      onSelectSlot(slot)
                      setIsOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left transition-colors hover:bg-[var(--term-bg-surface)]"
                    style={{
                      color: isSelected
                        ? 'var(--term-accent)'
                        : 'var(--term-text-primary)',
                    }}
                  >
                    <TerminalIcon
                      className="w-3 h-3"
                      style={{ color: 'var(--term-text-muted)' }}
                    />
                    <span className="truncate flex-1">{slot.name}</span>
                    {isSelected && (
                      <Check
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: 'var(--term-accent)' }}
                      />
                    )}
                  </button>
                )
              })}
            </>
          )}

          {/* Empty state */}
          {projectSlots.length === 0 && adHocSlots.length === 0 && (
            <div
              className="px-3 py-4 text-xs text-center"
              style={{ color: 'var(--term-text-muted)' }}
            >
              No terminals open
            </div>
          )}
        </div>
      )}
    </div>
  )
}

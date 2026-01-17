'use client'

import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback } from 'react'
import { KeyboardKey } from './KeyboardKey'
import { KEY_SEQUENCES } from './keyMappings'
import { useModifiers } from './ModifierContext'
import type { TerminalInputHandler } from './types'

interface ControlBarProps {
  onSend: TerminalInputHandler
  // Modifiers
  ctrlActive?: boolean
  onCtrlToggle?: () => void
  // Keyboard minimize
  minimized?: boolean
  onToggleMinimize?: () => void
}

export function ControlBar({
  onSend,
  ctrlActive = false,
  onCtrlToggle,
  minimized = false,
  onToggleMinimize,
}: ControlBarProps) {
  // Get shift state from shared modifier context
  const { modifiers, resetModifiers } = useModifiers()
  const shiftActive = modifiers.shift !== 'off'

  // Helper to clear modifiers after use
  const clearModifiers = useCallback(() => {
    if (ctrlActive && onCtrlToggle) onCtrlToggle()
    resetModifiers() // Clear sticky shift from context
  }, [ctrlActive, onCtrlToggle, resetModifiers])

  // Arrow key handlers - don't clear modifiers for arrows
  const handleArrowLeft = useCallback(
    () => onSend(KEY_SEQUENCES.ARROW_LEFT),
    [onSend],
  )
  const handleArrowUp = useCallback(
    () => onSend(KEY_SEQUENCES.ARROW_UP),
    [onSend],
  )
  const handleArrowDown = useCallback(
    () => onSend(KEY_SEQUENCES.ARROW_DOWN),
    [onSend],
  )
  const handleArrowRight = useCallback(
    () => onSend(KEY_SEQUENCES.ARROW_RIGHT),
    [onSend],
  )

  // Special key handlers
  const handleEsc = useCallback(() => {
    onSend(KEY_SEQUENCES.ESC)
    clearModifiers()
  }, [onSend, clearModifiers])

  const handleTab = useCallback(() => {
    if (shiftActive) {
      // Shift+Tab (backtab) - reverse tab completion
      onSend('\x1b[Z')
    } else {
      onSend(KEY_SEQUENCES.TAB)
    }
    clearModifiers()
  }, [shiftActive, onSend, clearModifiers])

  return (
    <div
      className="flex items-center gap-1 px-1.5 py-1"
      style={{
        backgroundColor: 'var(--term-bg-surface)',
        borderTop: '1px solid var(--term-border)',
      }}
    >
      {/* Arrow keys - optimized touch targets */}
      <div className="flex items-center gap-0.5">
        <KeyboardKey
          label="←"
          onPress={handleArrowLeft}
          className="w-10 h-9 text-lg"
        />
        <KeyboardKey
          label="↑"
          onPress={handleArrowUp}
          className="w-9 h-9 text-lg"
        />
        <KeyboardKey
          label="↓"
          onPress={handleArrowDown}
          className="w-9 h-9 text-lg"
        />
        <KeyboardKey
          label="→"
          onPress={handleArrowRight}
          className="w-10 h-9 text-lg"
        />
      </div>

      {/* Quick Ctrl shortcuts */}
      <div className="flex items-center gap-0.5 ml-0.5">
        <button
          type="button"
          onClick={() => onSend('\x03')} // Ctrl+C (ETX)
          className="h-9 px-2 rounded-md text-[10px] font-medium transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            color: 'var(--term-text-muted)',
            border: '1px solid var(--term-border)',
          }}
          title="Interrupt (Ctrl+C)"
        >
          ^C
        </button>
        <button
          type="button"
          onClick={() => onSend('\x04')} // Ctrl+D (EOT)
          className="h-9 px-2 rounded-md text-[10px] font-medium transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            color: 'var(--term-text-muted)',
            border: '1px solid var(--term-border)',
          }}
          title="EOF (Ctrl+D)"
        >
          ^D
        </button>
        <button
          type="button"
          onClick={() => onSend('\x1a')} // Ctrl+Z (SUB)
          className="h-9 px-2 rounded-md text-[10px] font-medium transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            color: 'var(--term-text-muted)',
            border: '1px solid var(--term-border)',
          }}
          title="Suspend (Ctrl+Z)"
        >
          ^Z
        </button>
      </div>

      {/* Special terminal keys */}
      <div className="flex items-center gap-0.5 ml-0.5">
        <KeyboardKey
          label="ESC"
          onPress={handleEsc}
          className="text-xs px-1.5 h-9"
        />
        <KeyboardKey
          label="TAB"
          onPress={handleTab}
          className="text-xs px-1.5 h-9"
        />
        <button
          type="button"
          onClick={onCtrlToggle}
          className="h-9 px-2 rounded-md text-xs font-medium transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: ctrlActive
              ? 'var(--term-accent)'
              : 'var(--term-bg-elevated)',
            color: ctrlActive
              ? 'var(--term-bg-deep)'
              : 'var(--term-text-muted)',
            border: `1px solid ${ctrlActive ? 'var(--term-accent)' : 'var(--term-border)'}`,
            boxShadow: ctrlActive ? '0 0 8px var(--term-accent-glow)' : 'none',
          }}
        >
          CTRL
        </button>
      </div>

      {/* Right side - keyboard toggle */}
      {onToggleMinimize && (
        <button
          type="button"
          onClick={onToggleMinimize}
          className="flex items-center justify-center h-9 w-9 rounded-md transition-all duration-150 ml-auto"
          style={{
            backgroundColor: minimized
              ? 'var(--term-accent)'
              : 'var(--term-bg-elevated)',
            color: minimized ? 'var(--term-bg-deep)' : 'var(--term-text-muted)',
            border: `1px solid ${minimized ? 'var(--term-accent)' : 'var(--term-border)'}`,
            boxShadow: minimized ? '0 0 8px var(--term-accent-glow)' : 'none',
          }}
          title={minimized ? 'Show keyboard' : 'Hide keyboard'}
        >
          {minimized ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  )
}

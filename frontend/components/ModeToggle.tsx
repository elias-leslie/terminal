'use client'

import { Loader2, Sparkles, Terminal } from 'lucide-react'
import { useCallback, useState } from 'react'

export type TerminalMode = 'shell' | 'claude'

interface ModeToggleProps {
  value: TerminalMode
  onChange: (mode: TerminalMode) => void | Promise<void>
  disabled?: boolean
  isMobile?: boolean
  /** External loading state - when true, toggle is disabled and shows spinner */
  isLoading?: boolean
}

/**
 * Single-click toggle for switching between Shell and Claude modes.
 * Industrial control panel aesthetic with glowing Claude state.
 */
export function ModeToggle({
  value,
  onChange,
  disabled = false,
  isMobile = false,
  isLoading = false,
}: ModeToggleProps) {
  const [internalLoading, setInternalLoading] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const isCurrentlyLoading = isLoading || internalLoading
  const isDisabled = disabled || isCurrentlyLoading
  const isClaudeMode = value === 'claude'

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (isDisabled) return

      const oppositeMode: TerminalMode = isClaudeMode ? 'shell' : 'claude'

      setInternalLoading(true)
      try {
        await onChange(oppositeMode)
      } catch (error) {
        console.error('Failed to switch mode:', error)
      } finally {
        setInternalLoading(false)
      }
    },
    [isClaudeMode, onChange, isDisabled],
  )

  const tooltipText = isCurrentlyLoading
    ? 'Switching mode...'
    : isClaudeMode
      ? 'Claude mode — click for Shell'
      : 'Shell mode — click for Claude'

  const size = isMobile ? 32 : 26
  const iconSize = isMobile ? 16 : 14

  return (
    <>
      <button
        data-testid="mode-toggle"
        onClick={handleClick}
        disabled={isDisabled}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="mode-toggle-btn"
        style={{
          // Base button styles
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: 6,
          border: '1px solid',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          // Mode-specific styling
          backgroundColor: isClaudeMode
            ? 'rgba(0, 255, 159, 0.08)'
            : isHovered && !isDisabled
              ? 'var(--term-bg-elevated)'
              : 'var(--term-bg-surface)',
          borderColor: isClaudeMode
            ? 'var(--term-accent-muted)'
            : isHovered && !isDisabled
              ? 'var(--term-border-active)'
              : 'var(--term-border)',
          boxShadow: isClaudeMode
            ? '0 0 8px var(--term-accent-glow), inset 0 0 12px var(--term-accent-glow)'
            : 'none',
          opacity: isDisabled ? 0.5 : 1,
        }}
        title={tooltipText}
        aria-label={tooltipText}
        aria-busy={isCurrentlyLoading}
      >
        {/* Glow ring for Claude mode */}
        {isClaudeMode && !isCurrentlyLoading && (
          <span
            className="mode-toggle-glow"
            style={{
              position: 'absolute',
              inset: -2,
              borderRadius: 8,
              border: '1px solid var(--term-accent)',
              opacity: 0.3,
              animation: 'mode-toggle-pulse 2s ease-in-out infinite',
            }}
          />
        )}

        {/* Icon container with transition */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.2s ease, color 0.2s ease',
            transform:
              isHovered && !isDisabled && !isCurrentlyLoading
                ? 'scale(1.1)'
                : 'scale(1)',
          }}
        >
          {isCurrentlyLoading ? (
            <Loader2
              width={iconSize}
              height={iconSize}
              style={{
                color: 'var(--term-accent)',
                animation: 'mode-toggle-spin 0.8s linear infinite',
              }}
            />
          ) : isClaudeMode ? (
            <Sparkles
              width={iconSize}
              height={iconSize}
              style={{
                color: 'var(--term-accent)',
                filter: 'drop-shadow(0 0 3px var(--term-accent-glow))',
              }}
            />
          ) : (
            <Terminal
              width={iconSize}
              height={iconSize}
              style={{
                color:
                  isHovered && !isDisabled
                    ? 'var(--term-text-primary)'
                    : 'var(--term-text-muted)',
              }}
            />
          )}
        </span>

        {/* Active state indicator dot */}
        <span
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            width: 4,
            height: 4,
            borderRadius: '50%',
            backgroundColor: isClaudeMode
              ? 'var(--term-accent)'
              : 'var(--term-text-muted)',
            opacity: isClaudeMode ? 1 : 0.4,
            transition: 'all 0.2s ease',
            boxShadow: isClaudeMode ? '0 0 4px var(--term-accent)' : 'none',
          }}
        />
      </button>

      {/* Scoped keyframe animations */}
      <style jsx>{`
        @keyframes mode-toggle-pulse {
          0%,
          100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 0.4;
            transform: scale(1.02);
          }
        }

        @keyframes mode-toggle-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .mode-toggle-btn:focus-visible {
          outline: 2px solid var(--term-accent);
          outline-offset: 2px;
        }

        .mode-toggle-btn:active:not(:disabled) {
          transform: scale(0.95);
        }
      `}</style>
    </>
  )
}

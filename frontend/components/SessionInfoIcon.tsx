'use client'

import { Check, Info } from 'lucide-react'
import { memo, useCallback, useState } from 'react'

export interface SessionInfoIconProps {
  sessionId: string
  mode: 'shell' | 'claude'
  timestamp?: string
  className?: string
}

/**
 * Info icon with session details tooltip and copy-to-clipboard on click.
 */
export const SessionInfoIcon = memo(function SessionInfoIcon({
  sessionId,
  mode,
  timestamp,
  className,
}: SessionInfoIconProps) {
  const [copied, setCopied] = useState(false)

  const tooltipText = [
    `Session: ${sessionId}`,
    `Mode: ${mode}`,
    timestamp ? `Created: ${timestamp}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tooltipText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }, [tooltipText])

  return (
    <button
      data-testid="session-info-icon"
      onClick={handleClick}
      className={`p-1 rounded transition-colors duration-150 ${className || ''}`}
      style={{
        color: copied ? 'var(--term-accent)' : 'var(--term-text-muted)',
      }}
      title={copied ? 'Copied!' : tooltipText}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.backgroundColor = 'var(--term-bg-elevated)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent'
      }}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5" />
      ) : (
        <Info className="w-3.5 h-3.5" />
      )}
    </button>
  )
})

'use client'

import { useCallback, useState } from 'react'
import { PromptCleaner } from './PromptCleaner'

interface PromptCleanerTriggerProps {
  /** Get the current input from the terminal */
  getCurrentInput: () => string
  /** Send cleaned prompt to terminal */
  onSendCleaned: (prompt: string) => void
  /** LLM cleanup function - integrate with your agent-hub */
  cleanPrompt: (prompt: string, refinement?: string) => Promise<string>
  /** Disabled state */
  disabled?: boolean
  /** Variant for different contexts */
  variant?: 'default' | 'compact' | 'mobile'
}

export function PromptCleanerTrigger({
  getCurrentInput,
  onSendCleaned,
  cleanPrompt,
  disabled = false,
  variant = 'default',
}: PromptCleanerTriggerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [rawPrompt, setRawPrompt] = useState('')

  const handleOpen = useCallback(() => {
    const input = getCurrentInput()
    if (!input.trim()) return
    setRawPrompt(input)
    setIsOpen(true)
  }, [getCurrentInput])

  const handleSend = useCallback(
    (cleaned: string) => {
      onSendCleaned(cleaned)
      setIsOpen(false)
      setRawPrompt('')
    },
    [onSendCleaned],
  )

  const handleCancel = useCallback(() => {
    setIsOpen(false)
    setRawPrompt('')
  }, [])

  const buttonClass = `cleaner-trigger-btn ${variant}`

  return (
    <>
      <button
        className={buttonClass}
        onClick={handleOpen}
        disabled={disabled}
        title="Clean & format prompt before sending"
      >
        <svg
          className="cleaner-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Sparkle/magic wand icon */}
          <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
          <path d="M19 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          <path d="M3 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
        </svg>
        {variant !== 'compact' && <span className="btn-text">Clean</span>}
      </button>

      {isOpen && (
        <PromptCleaner
          rawPrompt={rawPrompt}
          onSend={handleSend}
          onCancel={handleCancel}
          cleanPrompt={cleanPrompt}
          showDiffToggle={true}
        />
      )}

      <style jsx>{`
        .cleaner-trigger-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: rgba(0, 255, 159, 0.08);
          border: 1px solid rgba(0, 255, 159, 0.25);
          border-radius: 6px;
          color: rgba(0, 255, 159, 0.8);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .cleaner-trigger-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            transparent 0%,
            rgba(0, 255, 159, 0.1) 50%,
            transparent 100%
          );
          transform: translateX(-100%);
          transition: transform 0.6s ease;
        }

        .cleaner-trigger-btn:hover::before {
          transform: translateX(100%);
        }

        .cleaner-trigger-btn:hover {
          background: rgba(0, 255, 159, 0.15);
          border-color: rgba(0, 255, 159, 0.5);
          color: #00ff9f;
          box-shadow: 0 0 15px rgba(0, 255, 159, 0.2);
        }

        .cleaner-trigger-btn:active {
          transform: scale(0.98);
        }

        .cleaner-trigger-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
        }

        .cleaner-trigger-btn:disabled::before {
          display: none;
        }

        /* Variants */
        .cleaner-trigger-btn.default {
          padding: 8px 14px;
          min-width: 80px;
        }

        .cleaner-trigger-btn.compact {
          padding: 6px 8px;
          min-width: unset;
        }

        .cleaner-trigger-btn.mobile {
          padding: 10px 16px;
          font-size: 12px;
          border-radius: 8px;
        }

        .cleaner-icon {
          width: 14px;
          height: 14px;
          flex-shrink: 0;
        }

        .compact .cleaner-icon {
          width: 16px;
          height: 16px;
        }

        .btn-text {
          position: relative;
          z-index: 1;
          letter-spacing: 0.3px;
        }

        /* Mobile-specific */
        @media (max-width: 768px) {
          .cleaner-trigger-btn.default {
            padding: 10px 16px;
          }
        }
      `}</style>
    </>
  )
}

export default PromptCleanerTrigger

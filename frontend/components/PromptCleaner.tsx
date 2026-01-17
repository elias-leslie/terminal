'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './PromptCleaner.module.css'

type CleanerState = 'idle' | 'processing' | 'preview' | 'refining'

interface PromptCleanerProps {
  /** The raw prompt text to clean */
  rawPrompt: string
  /** Called when user confirms sending the cleaned prompt */
  onSend: (cleanedPrompt: string) => void
  /** Called when user cancels */
  onCancel: () => void
  /** Function to call the LLM for cleaning */
  cleanPrompt: (prompt: string, refinement?: string) => Promise<string>
  /** Optional: show diff view toggle */
  showDiffToggle?: boolean
}

export function PromptCleaner({
  rawPrompt,
  onSend,
  onCancel,
  cleanPrompt,
  showDiffToggle = true,
}: PromptCleanerProps) {
  const [state, setState] = useState<CleanerState>('idle')
  const [cleanedPrompt, setCleanedPrompt] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const [refinementInput, setRefinementInput] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [scanProgress, setScanProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleClean = useCallback(
    async (refinement?: string) => {
      setState(refinement ? 'refining' : 'processing')
      try {
        const result = await cleanPrompt(rawPrompt, refinement)
        setCleanedPrompt(result)
        setEditedPrompt(result)
        setState('preview')
      } catch (error) {
        console.error('Failed to clean prompt:', error)
        setState('idle')
      }
    },
    [cleanPrompt, rawPrompt]
  )

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50)
    return () => clearTimeout(timer)
  }, [])

  // Auto-start cleaning on mount
  useEffect(() => {
    handleClean()
  }, [handleClean])

  // Typewriter effect for cleaned prompt
  useEffect(() => {
    if (state !== 'preview' || !cleanedPrompt) return

    let index = 0
    setDisplayedText('')

    const interval = setInterval(() => {
      if (index < cleanedPrompt.length) {
        setDisplayedText(cleanedPrompt.slice(0, index + 1))
        index++
      } else {
        clearInterval(interval)
      }
    }, 12)

    return () => clearInterval(interval)
  }, [cleanedPrompt, state])

  // Scan progress animation
  useEffect(() => {
    if (state !== 'processing') {
      setScanProgress(0)
      return
    }

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) return 0
        return prev + 2
      })
    }, 50)

    return () => clearInterval(interval)
  }, [state])

  const handleSend = () => {
    const finalPrompt = isEditing ? editedPrompt : cleanedPrompt
    onSend(finalPrompt)
  }

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(onCancel, 300)
  }, [onCancel])

  const handleRefine = () => {
    if (refinementInput.trim()) {
      handleClean(refinementInput)
      setRefinementInput('')
    }
  }

  const toggleEditMode = () => {
    setIsEditing(!isEditing)
    if (!isEditing) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }

  return (
    <>
      {/* Backdrop with scanline texture */}
      <div
        className={`${styles.backdrop} ${isVisible ? styles.backdropVisible : ''}`}
        onClick={handleClose}
      />

      {/* Main panel */}
      <div
        ref={panelRef}
        data-testid="prompt-cleaner-modal"
        className={`${styles.panel} ${isVisible ? styles.panelVisible : ''}`}
      >
        {/* Scanline overlay */}
        <div className={styles.scanlineOverlay} />

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.terminalIcon}>⌘</span>
            <span className={styles.headerTitle}>PROMPT_CLEANER</span>
            <span className={styles.headerVersion}>v1.0</span>
          </div>
          <div className={styles.headerRight}>
            {showDiffToggle && state === 'preview' && (
              <button
                className={`${styles.toggleBtn} ${showDiff ? styles.toggleBtnActive : ''}`}
                onClick={() => setShowDiff(!showDiff)}
              >
                <span className={styles.toggleIcon}>◐</span>
                DIFF
              </button>
            )}
            <button
              data-testid="prompt-cleaner-modal-close"
              className={styles.closeBtn}
              onClick={handleClose}
            >
              <span>×</span>
            </button>
          </div>
        </div>

        {/* Processing state */}
        {(state === 'processing' || state === 'refining') && (
          <div className={styles.processingContainer}>
            <div className={styles.scanAnimation}>
              <div
                className={styles.scanLine}
                style={{ top: `${scanProgress}%` }}
              />
              <div className={styles.scanText}>
                {state === 'refining'
                  ? '> REFINING...'
                  : '> ANALYZING PROMPT...'}
              </div>
              <div className={styles.originalPreview}>
                {rawPrompt.split('\n').map((line, i) => (
                  <div key={i} className={styles.scanLineText}>
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Preview state */}
        {state === 'preview' && (
          <div className={styles.previewContainer}>
            {showDiff ? (
              <div className={styles.diffView}>
                <div
                  className={`${styles.diffPanel} ${styles.diffPanelOriginal}`}
                >
                  <div
                    className={`${styles.diffLabel} ${styles.diffLabelOriginal}`}
                  >
                    ORIGINAL
                  </div>
                  <div className={styles.diffContent}>{rawPrompt}</div>
                </div>
                <div className={styles.diffDivider}>
                  <span className={styles.arrow}>→</span>
                </div>
                <div
                  className={`${styles.diffPanel} ${styles.diffPanelCleaned}`}
                >
                  <div
                    className={`${styles.diffLabel} ${styles.diffLabelCleaned}`}
                  >
                    CLEANED
                  </div>
                  <div className={styles.diffContent}>{displayedText}</div>
                </div>
              </div>
            ) : (
              <div className={styles.singleView}>
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    className={styles.editTextarea}
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    placeholder="Edit your prompt..."
                  />
                ) : (
                  <div className={styles.cleanedPreview}>
                    <div className={styles.outputLabel}>
                      <span className={styles.labelIcon}>▸</span>
                      OUTPUT
                    </div>
                    <div className={styles.cleanedText}>
                      {displayedText}
                      <span className={styles.cursorBlink}>█</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refinement input */}
            <div className={styles.refinementSection}>
              <div className={styles.refinementInputWrapper}>
                <span className={styles.inputPrefix}>$</span>
                <input
                  type="text"
                  className={styles.refinementInput}
                  placeholder="Refine: 'make it shorter', 'add context about X'..."
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                />
                {refinementInput && (
                  <button className={styles.refineBtn} onClick={handleRefine}>
                    ↵
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action bar */}
        {state === 'preview' && (
          <div className={styles.actionBar}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={handleClose}
            >
              <span className={styles.btnIcon}>✕</span>
              CANCEL
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={toggleEditMode}
            >
              <span className={styles.btnIcon}>{isEditing ? '◉' : '✎'}</span>
              {isEditing ? 'PREVIEW' : 'EDIT'}
            </button>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={handleSend}
            >
              <span className={styles.btnIcon}>▶</span>
              SEND
              <span className={styles.keyHint}>⏎</span>
            </button>
          </div>
        )}

        {/* Glow effects */}
        <div className={styles.glowTop} />
        <div className={styles.glowBottom} />
      </div>
    </>
  )
}

export default PromptCleaner

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './PromptCleaner.module.css'

type CleanerState = 'idle' | 'processing' | 'preview' | 'refining'

interface PromptCleanerProps {
  rawPrompt: string
  onSend: (cleanedPrompt: string) => void
  onCancel: () => void
  cleanPrompt: (prompt: string, refinement?: string) => Promise<string>
  showDiffToggle?: boolean
}

interface ProcessingViewProps { state: CleanerState; rawPrompt: string; scanProgress: number }
interface HeaderBarProps { showDiffToggle: boolean; state: CleanerState; showDiff: boolean; onToggleDiff: () => void; onClose: () => void }
interface ActionBarProps { isEditing: boolean; onCancel: () => void; onToggleEdit: () => void; onSend: () => void }
interface PreviewViewProps {
  showDiff: boolean; isEditing: boolean; rawPrompt: string; displayedText: string
  editedPrompt: string; refinementInput: string; textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onEditedChange: (value: string) => void; onRefinementChange: (value: string) => void; onRefine: () => void
}

function ProcessingView({ state, rawPrompt, scanProgress }: ProcessingViewProps) {
  return (
    <div className={styles.processingContainer}>
      <div className={styles.scanAnimation}>
        <div className={styles.scanLine} style={{ top: `${scanProgress}%` }} />
        <div className={styles.scanText}>{state === 'refining' ? '> REFINING...' : '> ANALYZING PROMPT...'}</div>
        <div className={styles.originalPreview}>
          {rawPrompt.split('\n').map((line, i) => <div key={i} className={styles.scanLineText}>{line || '\u00A0'}</div>)}
        </div>
      </div>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${scanProgress}%` }} />
      </div>
    </div>
  )
}

function PreviewView({ showDiff, isEditing, rawPrompt, displayedText, editedPrompt, refinementInput, textareaRef, onEditedChange, onRefinementChange, onRefine }: PreviewViewProps) {
  return (
    <div className={styles.previewContainer}>
      {showDiff ? (
        <div className={styles.diffView}>
          <div className={`${styles.diffPanel} ${styles.diffPanelOriginal}`}>
            <div className={`${styles.diffLabel} ${styles.diffLabelOriginal}`}>ORIGINAL</div>
            <div className={styles.diffContent}>{rawPrompt}</div>
          </div>
          <div className={styles.diffDivider}><span className={styles.arrow}>→</span></div>
          <div className={`${styles.diffPanel} ${styles.diffPanelCleaned}`}>
            <div className={`${styles.diffLabel} ${styles.diffLabelCleaned}`}>CLEANED</div>
            <div className={styles.diffContent}>{displayedText}</div>
          </div>
        </div>
      ) : (
        <div className={styles.singleView}>
          {isEditing ? (
            <textarea ref={textareaRef} className={styles.editTextarea} value={editedPrompt}
              onChange={(e) => onEditedChange(e.target.value)} placeholder="Edit your prompt..." />
          ) : (
            <div className={styles.cleanedPreview}>
              <div className={styles.outputLabel}><span className={styles.labelIcon}>▸</span>OUTPUT</div>
              <div className={styles.cleanedText}>{displayedText}<span className={styles.cursorBlink}>█</span></div>
            </div>
          )}
        </div>
      )}
      <div className={styles.refinementSection}>
        <div className={styles.refinementInputWrapper}>
          <span className={styles.inputPrefix}>$</span>
          <input type="text" className={styles.refinementInput} placeholder="Refine: 'make it shorter', 'add context about X'..."
            value={refinementInput} onChange={(e) => onRefinementChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onRefine()} />
          {refinementInput && <button className={styles.refineBtn} onClick={onRefine}>↵</button>}
        </div>
      </div>
    </div>
  )
}

function HeaderBar({ showDiffToggle, state, showDiff, onToggleDiff, onClose }: HeaderBarProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <span className={styles.terminalIcon}>⌘</span>
        <span className={styles.headerTitle}>PROMPT_CLEANER</span>
        <span className={styles.headerVersion}>v1.0</span>
      </div>
      <div className={styles.headerRight}>
        {showDiffToggle && state === 'preview' && (
          <button className={`${styles.toggleBtn} ${showDiff ? styles.toggleBtnActive : ''}`} onClick={onToggleDiff}>
            <span className={styles.toggleIcon}>◐</span>DIFF
          </button>
        )}
        <button data-testid="prompt-cleaner-modal-close" className={styles.closeBtn} onClick={onClose}><span>×</span></button>
      </div>
    </div>
  )
}

function ActionBar({ isEditing, onCancel, onToggleEdit, onSend }: ActionBarProps) {
  return (
    <div className={styles.actionBar}>
      <button className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={onCancel}><span className={styles.btnIcon}>✕</span>CANCEL</button>
      <button className={`${styles.actionBtn} ${styles.actionBtnSecondary}`} onClick={onToggleEdit}><span className={styles.btnIcon}>{isEditing ? '◉' : '✎'}</span>{isEditing ? 'PREVIEW' : 'EDIT'}</button>
      <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={onSend}><span className={styles.btnIcon}>▶</span>SEND<span className={styles.keyHint}>⏎</span></button>
    </div>
  )
}

export function PromptCleaner({ rawPrompt, onSend, onCancel, cleanPrompt, showDiffToggle = true }: PromptCleanerProps) {
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

  useEffect(() => { const timer = setTimeout(() => setIsVisible(true), 50); return () => clearTimeout(timer) }, [])
  useEffect(() => { handleClean() }, [handleClean])
  useEffect(() => {
    if (state !== 'preview' || !cleanedPrompt) return
    let index = 0; setDisplayedText('')
    const interval = setInterval(() => {
      if (index < cleanedPrompt.length) { setDisplayedText(cleanedPrompt.slice(0, index + 1)); index++ }
      else clearInterval(interval)
    }, 12)
    return () => clearInterval(interval)
  }, [cleanedPrompt, state])
  useEffect(() => {
    if (state !== 'processing') { setScanProgress(0); return }
    const interval = setInterval(() => { setScanProgress((prev) => (prev >= 100 ? 0 : prev + 2)) }, 50)
    return () => clearInterval(interval)
  }, [state])

  const handleSend = () => onSend(isEditing ? editedPrompt : cleanedPrompt)
  const handleClose = useCallback(() => { setIsVisible(false); setTimeout(onCancel, 300) }, [onCancel])
  const handleRefine = () => { if (refinementInput.trim()) { handleClean(refinementInput); setRefinementInput('') } }
  const toggleEditMode = () => { setIsEditing(!isEditing); if (!isEditing) setTimeout(() => textareaRef.current?.focus(), 100) }

  return (
    <>
      <div className={`${styles.backdrop} ${isVisible ? styles.backdropVisible : ''}`} onClick={handleClose} />
      <div data-testid="prompt-cleaner-modal" className={`${styles.panel} ${isVisible ? styles.panelVisible : ''}`}>
        <div className={styles.scanlineOverlay} />
        <HeaderBar showDiffToggle={showDiffToggle} state={state} showDiff={showDiff} onToggleDiff={() => setShowDiff(!showDiff)} onClose={handleClose} />
        {(state === 'processing' || state === 'refining') && <ProcessingView state={state} rawPrompt={rawPrompt} scanProgress={scanProgress} />}
        {state === 'preview' && <PreviewView showDiff={showDiff} isEditing={isEditing} rawPrompt={rawPrompt} displayedText={displayedText}
          editedPrompt={editedPrompt} refinementInput={refinementInput} textareaRef={textareaRef} onEditedChange={setEditedPrompt}
          onRefinementChange={setRefinementInput} onRefine={handleRefine} />}
        {state === 'preview' && <ActionBar isEditing={isEditing} onCancel={handleClose} onToggleEdit={toggleEditMode} onSend={handleSend} />}
        <div className={styles.glowTop} />
        <div className={styles.glowBottom} />
      </div>
    </>
  )
}

export default PromptCleaner

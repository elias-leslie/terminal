'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

type CleanerState = 'idle' | 'processing' | 'preview' | 'refining';

interface PromptCleanerProps {
  /** The raw prompt text to clean */
  rawPrompt: string;
  /** Called when user confirms sending the cleaned prompt */
  onSend: (cleanedPrompt: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
  /** Function to call the LLM for cleaning */
  cleanPrompt: (prompt: string, refinement?: string) => Promise<string>;
  /** Optional: show diff view toggle */
  showDiffToggle?: boolean;
}

export function PromptCleaner({
  rawPrompt,
  onSend,
  onCancel,
  cleanPrompt,
  showDiffToggle = true,
}: PromptCleanerProps) {
  const [state, setState] = useState<CleanerState>('idle');
  const [cleanedPrompt, setCleanedPrompt] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [refinementInput, setRefinementInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Auto-start cleaning on mount
  useEffect(() => {
    handleClean();
  }, []);

  // Typewriter effect for cleaned prompt
  useEffect(() => {
    if (state !== 'preview' || !cleanedPrompt) return;

    let index = 0;
    setDisplayedText('');

    const interval = setInterval(() => {
      if (index < cleanedPrompt.length) {
        setDisplayedText(cleanedPrompt.slice(0, index + 1));
        index++;
      } else {
        clearInterval(interval);
      }
    }, 12);

    return () => clearInterval(interval);
  }, [cleanedPrompt, state]);

  // Scan progress animation
  useEffect(() => {
    if (state !== 'processing') {
      setScanProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) return 0;
        return prev + 2;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [state]);

  const handleClean = async (refinement?: string) => {
    setState(refinement ? 'refining' : 'processing');
    try {
      const result = await cleanPrompt(rawPrompt, refinement);
      setCleanedPrompt(result);
      setEditedPrompt(result);
      setState('preview');
    } catch (error) {
      console.error('Failed to clean prompt:', error);
      setState('idle');
    }
  };

  const handleSend = () => {
    const finalPrompt = isEditing ? editedPrompt : cleanedPrompt;
    onSend(finalPrompt);
  };

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setTimeout(onCancel, 300);
  }, [onCancel]);

  const handleRefine = () => {
    if (refinementInput.trim()) {
      handleClean(refinementInput);
      setRefinementInput('');
    }
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    if (!isEditing) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  return (
    <>
      {/* Backdrop with scanline texture */}
      <div
        className={`prompt-cleaner-backdrop ${isVisible ? 'visible' : ''}`}
        onClick={handleClose}
      />

      {/* Main panel */}
      <div
        ref={panelRef}
        className={`prompt-cleaner-panel ${isVisible ? 'visible' : ''}`}
      >
        {/* Scanline overlay */}
        <div className="scanline-overlay" />

        {/* Header */}
        <div className="cleaner-header">
          <div className="header-left">
            <span className="terminal-icon">⌘</span>
            <span className="header-title">PROMPT_CLEANER</span>
            <span className="header-version">v1.0</span>
          </div>
          <div className="header-right">
            {showDiffToggle && state === 'preview' && (
              <button
                className={`toggle-btn ${showDiff ? 'active' : ''}`}
                onClick={() => setShowDiff(!showDiff)}
              >
                <span className="toggle-icon">◐</span>
                DIFF
              </button>
            )}
            <button className="close-btn" onClick={handleClose}>
              <span>×</span>
            </button>
          </div>
        </div>

        {/* Processing state */}
        {(state === 'processing' || state === 'refining') && (
          <div className="processing-container">
            <div className="scan-animation">
              <div className="scan-line" style={{ top: `${scanProgress}%` }} />
              <div className="scan-text">
                {state === 'refining' ? '> REFINING...' : '> ANALYZING PROMPT...'}
              </div>
              <div className="original-preview">
                {rawPrompt.split('\n').map((line, i) => (
                  <div key={i} className="scan-line-text">{line || '\u00A0'}</div>
                ))}
              </div>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${scanProgress}%` }} />
            </div>
          </div>
        )}

        {/* Preview state */}
        {state === 'preview' && (
          <div className="preview-container">
            {showDiff ? (
              <div className="diff-view">
                <div className="diff-panel original">
                  <div className="diff-label">ORIGINAL</div>
                  <div className="diff-content">{rawPrompt}</div>
                </div>
                <div className="diff-divider">
                  <span className="arrow">→</span>
                </div>
                <div className="diff-panel cleaned">
                  <div className="diff-label">CLEANED</div>
                  <div className="diff-content">{displayedText}</div>
                </div>
              </div>
            ) : (
              <div className="single-view">
                {isEditing ? (
                  <textarea
                    ref={textareaRef}
                    className="edit-textarea"
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    placeholder="Edit your prompt..."
                  />
                ) : (
                  <div className="cleaned-preview">
                    <div className="output-label">
                      <span className="label-icon">▸</span>
                      OUTPUT
                    </div>
                    <div className="cleaned-text">
                      {displayedText}
                      <span className="cursor-blink">█</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Refinement input */}
            <div className="refinement-section">
              <div className="refinement-input-wrapper">
                <span className="input-prefix">$</span>
                <input
                  type="text"
                  className="refinement-input"
                  placeholder="Refine: 'make it shorter', 'add context about X'..."
                  value={refinementInput}
                  onChange={(e) => setRefinementInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefine()}
                />
                {refinementInput && (
                  <button className="refine-btn" onClick={handleRefine}>
                    ↵
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action bar */}
        {state === 'preview' && (
          <div className="action-bar">
            <button className="action-btn secondary" onClick={handleClose}>
              <span className="btn-icon">✕</span>
              CANCEL
            </button>
            <button className="action-btn secondary" onClick={toggleEditMode}>
              <span className="btn-icon">{isEditing ? '◉' : '✎'}</span>
              {isEditing ? 'PREVIEW' : 'EDIT'}
            </button>
            <button className="action-btn primary" onClick={handleSend}>
              <span className="btn-icon">▶</span>
              SEND
              <span className="key-hint">⏎</span>
            </button>
          </div>
        )}

        {/* Glow effects */}
        <div className="glow-top" />
        <div className="glow-bottom" />
      </div>

      <style jsx>{`
        /* Backdrop */
        .prompt-cleaner-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10, 14, 20, 0.85);
          backdrop-filter: blur(4px);
          z-index: 1000;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        .prompt-cleaner-backdrop.visible {
          opacity: 1;
        }

        /* Main Panel */
        .prompt-cleaner-panel {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          max-height: 85vh;
          min-height: 300px;
          background: linear-gradient(180deg, #0d1117 0%, #0a0e14 100%);
          border-top: 1px solid rgba(0, 255, 159, 0.3);
          border-radius: 16px 16px 0 0;
          z-index: 1001;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transform: translateY(100%);
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow:
            0 -20px 60px rgba(0, 0, 0, 0.5),
            0 0 80px rgba(0, 255, 159, 0.1),
            inset 0 1px 0 rgba(0, 255, 159, 0.2);
        }
        .prompt-cleaner-panel.visible {
          transform: translateY(0);
        }

        /* Scanline texture overlay */
        .scanline-overlay {
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.15) 2px,
            rgba(0, 0, 0, 0.15) 4px
          );
          pointer-events: none;
          z-index: 10;
        }

        /* Header */
        .cleaner-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(0, 255, 159, 0.15);
          background: rgba(0, 0, 0, 0.3);
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .terminal-icon {
          color: #00ff9f;
          font-size: 14px;
        }
        .header-title {
          font-family: 'JetBrains Mono', 'SF Mono', 'Consolas', monospace;
          font-size: 13px;
          font-weight: 600;
          color: #00ff9f;
          letter-spacing: 0.5px;
        }
        .header-version {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: rgba(0, 255, 159, 0.5);
          padding: 2px 6px;
          background: rgba(0, 255, 159, 0.1);
          border-radius: 4px;
        }
        .header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          background: transparent;
          border: 1px solid rgba(0, 255, 159, 0.3);
          border-radius: 4px;
          color: rgba(0, 255, 159, 0.7);
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .toggle-btn:hover, .toggle-btn.active {
          background: rgba(0, 255, 159, 0.15);
          border-color: #00ff9f;
          color: #00ff9f;
        }
        .toggle-icon {
          font-size: 12px;
        }
        .close-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .close-btn:hover {
          background: rgba(248, 81, 73, 0.2);
          border-color: rgba(248, 81, 73, 0.5);
          color: #f85149;
        }

        /* Processing State */
        .processing-container {
          flex: 1;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .scan-animation {
          position: relative;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(0, 255, 159, 0.2);
          border-radius: 8px;
          padding: 16px;
          overflow: hidden;
          min-height: 120px;
        }
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #00ff9f, transparent);
          box-shadow: 0 0 20px #00ff9f, 0 0 40px rgba(0, 255, 159, 0.5);
          transition: top 0.05s linear;
        }
        .scan-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: #00ff9f;
          margin-bottom: 12px;
          animation: blink 1s infinite;
        }
        @keyframes blink {
          50% { opacity: 0.5; }
        }
        .original-preview {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.4);
          line-height: 1.6;
        }
        .scan-line-text {
          transition: color 0.1s;
        }
        .progress-bar {
          height: 3px;
          background: rgba(0, 255, 159, 0.1);
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00ff9f, #00cc7f);
          box-shadow: 0 0 10px #00ff9f;
          transition: width 0.05s linear;
        }

        /* Preview State */
        .preview-container {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow: hidden;
        }

        /* Diff View */
        .diff-view {
          display: flex;
          gap: 12px;
          flex: 1;
          min-height: 0;
        }
        .diff-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: hidden;
        }
        .diff-panel.original {
          border-color: rgba(248, 81, 73, 0.3);
        }
        .diff-panel.cleaned {
          border-color: rgba(0, 255, 159, 0.3);
        }
        .diff-label {
          padding: 8px 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.5px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .diff-panel.original .diff-label {
          color: rgba(248, 81, 73, 0.8);
        }
        .diff-panel.cleaned .diff-label {
          color: #00ff9f;
        }
        .diff-content {
          flex: 1;
          padding: 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.85);
          overflow-y: auto;
          white-space: pre-wrap;
        }
        .diff-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          flex-shrink: 0;
        }
        .arrow {
          color: #00ff9f;
          font-size: 20px;
          animation: pulse-arrow 2s infinite;
        }
        @keyframes pulse-arrow {
          0%, 100% { opacity: 0.5; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(4px); }
        }

        /* Single View */
        .single-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .cleaned-preview {
          flex: 1;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(0, 255, 159, 0.2);
          border-radius: 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .output-label {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 10px 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 600;
          color: #00ff9f;
          background: rgba(0, 255, 159, 0.05);
          border-bottom: 1px solid rgba(0, 255, 159, 0.1);
          letter-spacing: 0.5px;
        }
        .label-icon {
          font-size: 10px;
        }
        .cleaned-text {
          flex: 1;
          padding: 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.9);
          overflow-y: auto;
          white-space: pre-wrap;
        }
        .cursor-blink {
          animation: cursor-blink 1s step-end infinite;
          color: #00ff9f;
          margin-left: 2px;
        }
        @keyframes cursor-blink {
          50% { opacity: 0; }
        }

        /* Edit textarea */
        .edit-textarea {
          flex: 1;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(0, 255, 159, 0.3);
          border-radius: 8px;
          padding: 14px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.9);
          resize: none;
          outline: none;
        }
        .edit-textarea:focus {
          border-color: #00ff9f;
          box-shadow: 0 0 0 2px rgba(0, 255, 159, 0.1);
        }

        /* Refinement Section */
        .refinement-section {
          padding-top: 8px;
        }
        .refinement-input-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 10px 14px;
          transition: border-color 0.2s;
        }
        .refinement-input-wrapper:focus-within {
          border-color: rgba(0, 255, 159, 0.5);
        }
        .input-prefix {
          color: #00ff9f;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 600;
        }
        .refinement-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.85);
        }
        .refinement-input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }
        .refine-btn {
          padding: 4px 10px;
          background: rgba(0, 255, 159, 0.15);
          border: 1px solid rgba(0, 255, 159, 0.4);
          border-radius: 4px;
          color: #00ff9f;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .refine-btn:hover {
          background: rgba(0, 255, 159, 0.25);
          border-color: #00ff9f;
        }

        /* Action Bar */
        .action-bar {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          background: rgba(0, 0, 0, 0.4);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .action-btn.secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.7);
        }
        .action-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.3);
          color: #fff;
        }
        .action-btn.primary {
          flex: 1;
          background: linear-gradient(135deg, rgba(0, 255, 159, 0.2), rgba(0, 200, 120, 0.2));
          border: 1px solid #00ff9f;
          color: #00ff9f;
          box-shadow: 0 0 20px rgba(0, 255, 159, 0.2);
        }
        .action-btn.primary:hover {
          background: linear-gradient(135deg, rgba(0, 255, 159, 0.3), rgba(0, 200, 120, 0.3));
          box-shadow: 0 0 30px rgba(0, 255, 159, 0.3);
          transform: translateY(-1px);
        }
        .btn-icon {
          font-size: 11px;
        }
        .key-hint {
          font-size: 10px;
          opacity: 0.6;
          margin-left: 4px;
        }

        /* Glow effects */
        .glow-top {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 60%;
          height: 1px;
          background: linear-gradient(90deg, transparent, #00ff9f, transparent);
          box-shadow: 0 0 20px rgba(0, 255, 159, 0.5);
        }
        .glow-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 80px;
          background: linear-gradient(180deg, transparent, rgba(0, 255, 159, 0.03));
          pointer-events: none;
        }

        /* Mobile adjustments */
        @media (max-width: 768px) {
          .prompt-cleaner-panel {
            max-height: 90vh;
            border-radius: 12px 12px 0 0;
          }
          .diff-view {
            flex-direction: column;
          }
          .diff-divider {
            width: 100%;
            height: 24px;
          }
          .arrow {
            transform: rotate(90deg);
          }
          @keyframes pulse-arrow {
            0%, 100% { opacity: 0.5; transform: rotate(90deg) translateX(0); }
            50% { opacity: 1; transform: rotate(90deg) translateX(4px); }
          }
          .action-bar {
            flex-wrap: wrap;
          }
          .action-btn.secondary {
            flex: 1;
            min-width: calc(50% - 5px);
          }
          .action-btn.primary {
            width: 100%;
            order: -1;
          }
        }
      `}</style>
    </>
  );
}

export default PromptCleaner;

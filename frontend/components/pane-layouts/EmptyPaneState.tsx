'use client'

interface EmptyPaneStateProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  onOpenModal?: () => void
}

/**
 * Empty state when no panes are displayed.
 */
export function EmptyPaneState({
  containerRef,
  onOpenModal,
}: EmptyPaneStateProps) {
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--term-bg-deep)' }}
    >
      <div
        onClick={onOpenModal}
        className="flex flex-col items-center gap-3 p-6 rounded-lg cursor-pointer transition-all hover:scale-105"
        style={{
          backgroundColor: 'var(--term-bg-surface)',
          border: '1px dashed var(--term-border)',
        }}
      >
        <div
          className="flex items-center justify-center w-12 h-12 rounded-full"
          style={{
            backgroundColor: 'var(--term-bg-elevated)',
            border: '1px solid var(--term-border)',
          }}
        >
          <span
            className="text-2xl font-light"
            style={{ color: 'var(--term-accent)' }}
          >
            +
          </span>
        </div>
        <span className="text-sm" style={{ color: 'var(--term-text-muted)' }}>
          Open terminal
        </span>
      </div>
    </div>
  )
}

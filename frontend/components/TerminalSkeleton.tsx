'use client'

/**
 * Skeleton loading state for terminal.
 * Shows a pulsing placeholder while terminals are loading.
 */
export function TerminalSkeleton() {
  return (
    <div
      className="flex-1 flex flex-col"
      style={{ backgroundColor: 'var(--term-bg-deep)' }}
    >
      {/* Header skeleton */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{
          backgroundColor: 'var(--term-bg-surface)',
          borderBottom: '1px solid var(--term-border)',
        }}
      >
        <div
          className="h-4 w-24 rounded animate-pulse"
          style={{ backgroundColor: 'var(--term-bg-elevated)' }}
        />
        <div className="flex-1" />
        <div
          className="h-4 w-4 rounded animate-pulse"
          style={{ backgroundColor: 'var(--term-bg-elevated)' }}
        />
      </div>

      {/* Terminal content skeleton */}
      <div className="flex-1 p-3 space-y-2 overflow-hidden">
        {/* Fake prompt line */}
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-20 rounded animate-pulse"
            style={{ backgroundColor: 'var(--term-bg-elevated)' }}
          />
          <div
            className="h-3 w-32 rounded animate-pulse opacity-60"
            style={{ backgroundColor: 'var(--term-bg-elevated)' }}
          />
        </div>

        {/* Fake output lines */}
        {[0.8, 0.6, 0.9, 0.4, 0.7, 0.5, 0.85, 0.3].map((width, i) => (
          <div
            key={i}
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: 'var(--term-bg-elevated)',
              width: `${width * 100}%`,
              opacity: 0.3 + i * 0.05,
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}

        {/* Blinking cursor */}
        <div className="flex items-center gap-2 mt-4">
          <div
            className="h-3 w-20 rounded animate-pulse"
            style={{ backgroundColor: 'var(--term-bg-elevated)' }}
          />
          <div
            className="h-4 w-2 rounded-sm animate-pulse"
            style={{
              backgroundColor: 'var(--term-accent)',
              animationDuration: '0.8s',
            }}
          />
        </div>
      </div>
    </div>
  )
}

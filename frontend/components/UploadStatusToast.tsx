'use client'

import { Loader2 } from 'lucide-react'

const TOAST_BASE_CLASSES =
  'absolute top-10 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-lg'

interface UploadProgressToastProps {
  progress: number
}

export function UploadProgressToast({ progress }: UploadProgressToastProps) {
  return (
    <div
      data-testid="upload-progress-toast"
      className={TOAST_BASE_CLASSES}
      style={{
        backgroundColor: 'var(--term-bg-elevated)',
        border: '1px solid var(--term-border)',
      }}
    >
      <div className="flex items-center gap-2">
        <Loader2
          className="w-4 h-4 animate-spin"
          style={{ color: 'var(--term-accent)' }}
        />
        <span className="text-sm" style={{ color: 'var(--term-text-primary)' }}>
          Uploading... {progress}%
        </span>
      </div>
    </div>
  )
}

interface UploadErrorToastProps {
  message: string
}

export function UploadErrorToast({ message }: UploadErrorToastProps) {
  return (
    <div
      data-testid="upload-error-toast"
      className={TOAST_BASE_CLASSES}
      style={{
        backgroundColor: 'var(--term-bg-elevated)',
        border: '1px solid var(--term-error)',
      }}
    >
      <span className="text-sm" style={{ color: 'var(--term-error)' }}>
        {message}
      </span>
    </div>
  )
}

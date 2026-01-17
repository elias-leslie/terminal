'use client'

import { Upload } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

interface FileUploadDropzoneProps {
  children: React.ReactNode
  onFileSelect: (file: File) => void
  disabled?: boolean
  className?: string
}

/**
 * Wraps content with drag-and-drop file upload support.
 * Shows overlay when dragging files over the drop zone.
 */
export function FileUploadDropzone({
  children,
  onFileSelect,
  disabled = false,
  className = '',
}: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (disabled) return

      dragCounter.current++
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true)
      }
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setIsDragging(false)
      dragCounter.current = 0

      if (disabled) return

      const files = e.dataTransfer.files
      if (files && files.length > 0) {
        // Only handle first file
        onFileSelect(files[0])
      }
    },
    [disabled, onFileSelect],
  )

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-sm transition-opacity duration-200"
          style={{
            backgroundColor: 'rgba(var(--term-bg-surface-rgb), 0.9)',
            border: '2px dashed var(--term-accent)',
          }}
        >
          <Upload
            className="w-12 h-12 mb-3"
            style={{ color: 'var(--term-accent)' }}
          />
          <span
            className="text-lg font-medium"
            style={{ color: 'var(--term-text-primary)' }}
          >
            Drop file to upload
          </span>
          <span
            className="text-sm mt-1"
            style={{ color: 'var(--term-text-muted)' }}
          >
            File will be uploaded and path inserted
          </span>
        </div>
      )}
    </div>
  )
}

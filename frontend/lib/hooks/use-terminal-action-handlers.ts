import { type MutableRefObject, useCallback, useRef } from 'react'
import type { TerminalHandle } from '@/components/Terminal'
import { useFileUpload } from '@/lib/hooks/use-file-upload'

interface UseTerminalActionHandlersParams {
  terminalRefs: MutableRefObject<Map<string, TerminalHandle | null>>
  activeSessionId: string | null
  showCleaner: boolean
  setShowCleaner: (show: boolean) => void
  setCleanerRawPrompt: (prompt: string) => void
}

export function useTerminalActionHandlers({
  terminalRefs,
  activeSessionId,
  setShowCleaner,
  setCleanerRawPrompt,
}: UseTerminalActionHandlersParams) {
  // File upload functionality
  const fileInputRef = useRef<HTMLInputElement>(null)
  const {
    uploadFile,
    progress,
    isUploading,
    error: uploadError,
  } = useFileUpload()

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelect = useCallback(
    async (file: File) => {
      const result = await uploadFile(file)
      if (result && activeSessionId) {
        // Insert path at cursor in the active terminal
        const terminalRef = terminalRefs.current.get(activeSessionId)
        if (terminalRef) {
          terminalRef.sendInput(result.path)
        }
      }
    },
    [uploadFile, activeSessionId, terminalRefs],
  )

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFileSelect(file)
      }
      // Reset input so the same file can be selected again
      e.target.value = ''
    },
    [handleFileSelect],
  )

  // Prompt cleaner handlers
  const handleCleanClick = useCallback(() => {
    if (!activeSessionId) return
    const terminalRef = terminalRefs.current.get(activeSessionId)
    if (!terminalRef) return
    const input = terminalRef.getLastLine()
    if (!input.trim()) return
    setCleanerRawPrompt(input)
    setShowCleaner(true)
  }, [activeSessionId, terminalRefs, setCleanerRawPrompt, setShowCleaner])

  const handleCleanerSend = useCallback(
    (cleanedPrompt: string) => {
      if (!activeSessionId) return
      const terminalRef = terminalRefs.current.get(activeSessionId)
      if (terminalRef) {
        // Clear current line (send Ctrl+U) then send cleaned prompt
        terminalRef.sendInput('\x15') // Ctrl+U
        terminalRef.sendInput(cleanedPrompt)
      }
      setShowCleaner(false)
      setCleanerRawPrompt('')
    },
    [activeSessionId, terminalRefs, setShowCleaner, setCleanerRawPrompt],
  )

  const handleCleanerCancel = useCallback(() => {
    setShowCleaner(false)
    setCleanerRawPrompt('')
  }, [setShowCleaner, setCleanerRawPrompt])

  return {
    // File upload
    fileInputRef,
    progress,
    isUploading,
    uploadError,
    handleUploadClick,
    handleFileSelect,
    handleFileInputChange,
    // Prompt cleaner
    handleCleanClick,
    handleCleanerSend,
    handleCleanerCancel,
  }
}

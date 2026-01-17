'use client'

import { useCallback, useState } from 'react'

interface UsePromptCleanerReturn {
  /** Clean a prompt using agent-hub */
  cleanPrompt: (prompt: string, refinement?: string) => Promise<string>
  /** Whether a clean operation is in progress */
  isLoading: boolean
  /** Last error from clean operation */
  error: string | null
  /** Clear error state */
  clearError: () => void
}

// Agent-hub API base URL - can be configured via env var
const AGENT_HUB_URL =
  process.env.NEXT_PUBLIC_AGENT_HUB_URL || 'https://agent.summitflow.dev'

// Model to use for prompt cleaning (fast and cheap)
const CLEAN_MODEL = 'claude-haiku-4-5'

// System prompt for cleaning
const SYSTEM_PROMPT = `You are a prompt formatting assistant. Your task is to clean and improve user prompts.

Rules:
1. Fix typos, grammar, and punctuation
2. Improve clarity and structure
3. Maintain the original intent
4. Keep the same level of detail unless refinement requests otherwise
5. Return ONLY the cleaned prompt, no explanations or preambles
6. If the prompt mentions code or technical terms, preserve them exactly`

/**
 * Hook for cleaning prompts via agent-hub.
 * Uses Claude Haiku for fast, cheap processing.
 */
export function usePromptCleaner(): UsePromptCleanerReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cleanPrompt = useCallback(
    async (prompt: string, refinement?: string): Promise<string> => {
      setIsLoading(true)
      setError(null)

      try {
        // Build the user message
        let userMessage = `Clean and improve this prompt:\n\n${prompt}`
        if (refinement) {
          userMessage += `\n\nAdditional instruction: ${refinement}`
        }

        const response = await fetch(`${AGENT_HUB_URL}/api/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: CLEAN_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
            max_tokens: 4096,
            temperature: 0.3, // Lower temperature for more consistent output
            project_id: 'terminal-prompt-cleaner',
            persist_session: false, // Don't persist these short-lived sessions
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || `API error: ${response.status}`)
        }

        const data = await response.json()
        const cleanedContent = data.content || data.message?.content

        if (!cleanedContent) {
          throw new Error('No content in response')
        }

        return cleanedContent
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to clean prompt'
        setError(message)

        // Fallback: return original prompt with basic cleanup
        console.warn('Prompt cleaner fallback:', message)
        return prompt.trim()
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    cleanPrompt,
    isLoading,
    error,
    clearError,
  }
}

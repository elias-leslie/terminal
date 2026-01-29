import type { ConnectionStatus, TerminalHandle } from '@/components/Terminal'
import type { ProjectTerminal } from '@/lib/hooks/use-project-terminals'
import type { TerminalPane } from '@/lib/hooks/use-terminal-panes'
import type { TerminalSession } from '@/lib/hooks/use-terminal-sessions'
import {
  findSessionByMode,
  generateProjectPaneName,
  shouldStartClaude,
  waitForTmuxInit,
} from './terminal-handler-utils'

/**
 * Navigate to an existing pane and start Claude if needed
 */
export async function navigateToPaneHelper(
  pane: TerminalPane,
  sessions: TerminalSession[],
  navigateToSession: (sessionId: string) => void,
  startClaude: (sessionId: string) => Promise<boolean>,
): Promise<void> {
  const targetSession = findSessionByMode(pane, pane.active_mode)
  if (!targetSession) return

  navigateToSession(targetSession.id)

  if (shouldStartClaude(pane, targetSession, sessions)) {
    await waitForTmuxInit()
    await startClaude(targetSession.id)
  }
}

/**
 * Create and navigate to a new project pane
 */
export async function createProjectPaneHelper(
  pt: ProjectTerminal,
  panes: TerminalPane[],
  panesAtLimit: boolean,
  createProjectPane: (
    paneName: string,
    projectId: string,
    workingDir?: string,
  ) => Promise<TerminalPane>,
  navigateToSession: (sessionId: string) => void,
  startClaude: (sessionId: string) => Promise<boolean>,
): Promise<void> {
  if (panesAtLimit) {
    console.warn('Cannot create pane: at maximum limit')
    return
  }

  try {
    const paneName = generateProjectPaneName(pt.projectId, panes)
    const newPane = await createProjectPane(
      paneName,
      pt.projectId,
      pt.rootPath ?? undefined,
    )
    const targetSession = findSessionByMode(newPane, pt.activeMode)
    if (!targetSession) return

    navigateToSession(targetSession.id)
    if (pt.activeMode === 'claude') {
      await waitForTmuxInit()
      await startClaude(targetSession.id)
    }
  } catch (error) {
    console.error('Failed to create project pane:', error)
  }
}

/**
 * Set terminal status in the status map
 */
export function updateTerminalStatus(
  prev: Map<string, ConnectionStatus>,
  sessionId: string,
  status: ConnectionStatus,
): Map<string, ConnectionStatus> {
  const next = new Map(prev)
  next.set(sessionId, status)
  return next
}

/**
 * Manage terminal reference
 */
export function manageTerminalRef(
  refs: Map<string, TerminalHandle>,
  sessionId: string,
  handle: TerminalHandle | null,
): void {
  handle ? refs.set(sessionId, handle) : refs.delete(sessionId)
}

import { getProjectSessionId } from '@/lib/utils/session'
import type { ProjectTerminal } from '@/lib/hooks/use-project-terminals'
import type { TerminalPane } from '@/lib/hooks/use-terminal-panes'
import type { TerminalSession } from '@/lib/hooks/use-terminal-sessions'
import {
  createProjectPaneHelper,
  navigateToPaneHelper,
} from './terminal-handler-helpers'
import {
  findSessionByMode,
  generateAdHocPaneName,
  generateProjectPaneName,
  waitForTmuxInit,
} from './terminal-handler-utils'

/**
 * Add a new ad-hoc terminal pane
 */
export async function addAdHocPaneAction(
  panes: TerminalPane[],
  panesAtLimit: boolean,
  createAdHocPane: (paneName: string, workingDir?: string) => Promise<TerminalPane>,
  navigateToSession: (sessionId: string) => void,
): Promise<void> {
  if (panesAtLimit) {
    console.warn('Cannot add pane: at maximum limit')
    return
  }

  try {
    const paneName = generateAdHocPaneName(panes)
    const newPane = await createAdHocPane(paneName)
    const shellSession = findSessionByMode(newPane, 'shell')
    if (shellSession) {
      navigateToSession(shellSession.id)
    }
  } catch (error) {
    console.error('Failed to create ad-hoc pane:', error)
  }
}

/**
 * Add a new project terminal pane
 */
export async function addProjectPaneAction(
  targetProjectId: string,
  mode: 'shell' | 'claude',
  rootPath: string | null | undefined,
  projectTerminals: ProjectTerminal[],
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
    console.warn('Cannot add pane: at maximum limit')
    return
  }

  // Resolve working directory
  let workingDir = rootPath
  if (workingDir === undefined) {
    const project = projectTerminals.find((p) => p.projectId === targetProjectId)
    if (!project) return
    workingDir = project.rootPath
  }

  try {
    const paneName = generateProjectPaneName(targetProjectId, panes)
    const newPane = await createProjectPane(
      paneName,
      targetProjectId,
      workingDir ?? undefined,
    )

    const targetSession = findSessionByMode(newPane, mode)
    if (!targetSession) {
      console.error('New pane missing session for mode:', mode)
      return
    }

    navigateToSession(targetSession.id)

    if (mode === 'claude') {
      await waitForTmuxInit()
      await startClaude(targetSession.id)
    }
  } catch (error) {
    console.error('Failed to create project pane:', error)
  }
}

/**
 * Handle project tab click - navigate to existing pane or create new one
 */
export async function handleProjectTabClickAction(
  pt: ProjectTerminal,
  panes: TerminalPane[],
  sessions: TerminalSession[],
  panesAtLimit: boolean,
  createProjectPane: (
    paneName: string,
    projectId: string,
    workingDir?: string,
  ) => Promise<TerminalPane>,
  navigateToSession: (sessionId: string) => void,
  startClaude: (sessionId: string) => Promise<boolean>,
): Promise<void> {
  // Legacy path (backwards compatibility)
  const legacySessionId = getProjectSessionId(pt)
  if (legacySessionId) {
    navigateToSession(legacySessionId)
    return
  }

  // Find existing pane or create new one
  const pane = panes.find((p) => p.project_id === pt.projectId)
  if (pane) {
    await navigateToPaneHelper(pane, sessions, navigateToSession, startClaude)
  } else {
    await createProjectPaneHelper(
      pt,
      panes,
      panesAtLimit,
      createProjectPane,
      navigateToSession,
      startClaude,
    )
  }
}

/**
 * Close all terminal panes and create a new ad-hoc terminal
 */
export async function closeAllPanesAction(
  panes: TerminalPane[],
  removePane: (paneId: string) => Promise<void>,
  createAdHocPane: (paneName: string, workingDir?: string) => Promise<TerminalPane>,
  navigateToSession: (sessionId: string) => void,
): Promise<void> {
  for (const pane of panes) {
    await removePane(pane.id)
  }

  try {
    const newPane = await createAdHocPane('Ad-Hoc Terminal')
    const shellSession = findSessionByMode(newPane, 'shell')
    if (shellSession) {
      navigateToSession(shellSession.id)
    }
  } catch (error) {
    console.error('Failed to create ad-hoc pane after close all:', error)
  }
}

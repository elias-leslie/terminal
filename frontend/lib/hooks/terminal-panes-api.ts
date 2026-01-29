import { buildApiUrl } from '../api-config'
import type {
  PaneListResponse,
  PaneCountResponse,
  CreatePaneRequest,
  UpdatePaneRequest,
  SwapPanesRequest,
  BulkLayoutUpdateRequest,
  TerminalPane,
} from './terminal-panes-types'

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(buildApiUrl(url), options)
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: `Request failed: ${res.status}` }))
    throw new Error(error.detail || `Request failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchPanes(): Promise<PaneListResponse> {
  return fetchJson('/api/terminal/panes')
}

export async function fetchPaneCount(): Promise<PaneCountResponse> {
  return fetchJson('/api/terminal/panes/count')
}

export async function createPane(request: CreatePaneRequest): Promise<TerminalPane> {
  return fetchJson('/api/terminal/panes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export async function updatePane(paneId: string, request: UpdatePaneRequest): Promise<TerminalPane> {
  return fetchJson(`/api/terminal/panes/${paneId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export async function deletePane(paneId: string): Promise<void> {
  const res = await fetch(buildApiUrl(`/api/terminal/panes/${paneId}`), { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete pane')
}

export async function swapPanes(request: SwapPanesRequest): Promise<void> {
  const res = await fetch(buildApiUrl('/api/terminal/panes/swap'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) throw new Error('Failed to swap panes')
}

export async function updateAllLayouts(request: BulkLayoutUpdateRequest): Promise<TerminalPane[]> {
  return fetchJson('/api/terminal/layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

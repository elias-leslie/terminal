

## Terminal Project Management API Implementation

Implement terminal project lifecycle via: `POST /api/terminal/projects/{id}/reset` (shell initialization), `POST /api/terminal/projects/{id}/disable` (status updates), and `PUT /api/terminal/projects/{id}/mode` (mode toggling). Persist project display orders using `POST /api/terminal/project-settings/bulk-order` via the `settings_store`.

*Rationale: These endpoints were successfully implemented and verified to handle terminal state transitions correctly.*

<!-- Pattern ID: 1e62c0db-12e5-4b45-9ed5-6dd782ac849d | Applied: 2025-12-30T01:19:56.753557 -->

## Terminal Project Mode Naming Convention

Use the field name `active_mode` instead of `default_mode` for all terminal project state representations. This applies to database columns, settings upsert logic, and API response objects such as `ProjectResponse`.

*Rationale: A significant refactoring was performed to align architectural clarity and state representation across backend and frontend.*

<!-- Pattern ID: 64c9547b-b233-4594-84fc-9a0d572e0bd2 | Applied: 2025-12-30T03:35:29.576775 -->

## Tmux-based Claude Process Verification

Verify background Claude processes using `pane_current_command` within a specific tmux session. Call `_is_claude_running_in_session(tmux_session)` and `_verify_claude_started(tmux_session)` without passing a generic `session_id` to ensure state is synchronized with the actual terminal environment.

*Rationale: Refactoring simplified the detection logic and removed redundant parameters, moving toward direct tmux state inspection.*

<!-- Pattern ID: e084251f-59aa-4fc1-b586-88cc478c9760 | Applied: 2025-12-30T03:35:29.610323 -->

## Terminal Resource Disposal and Event Cleanup

Explicitly call `wheelCleanup()` and `touchCleanup()` on the terminal instance before calling `terminal.dispose()`. This pattern prevents event listener leaks in React environments during component re-renders or unmounting.

*Rationale: A specific refactor was required to fix event listener leaks, establishing a manual cleanup pattern for the custom wheel interception logic.*

<!-- Pattern ID: 3e46d647-9084-4bf4-abae-26ca4e30b4ec | Applied: 2025-12-30T03:35:29.645035 -->

## Terminal Service Lifecycle Management

Restart terminal services via `sudo systemctl restart summitflow-terminal` (backend) and `sudo systemctl restart summitflow-terminal-frontend` (frontend). Verify they are 'active (running)' using `systemctl status` after any configuration or binary changes.

*Rationale: Standardizes the deployment and verification process for local service updates.*

<!-- Pattern ID: 666cddbc-e474-471d-b613-3f1bdea7270b | Applied: 2025-12-30T09:59:25.546392 -->

## Standardized Terminal Dimensions

Import terminal dimensions from the configuration module: `from terminal.config import TMUX_DEFAULT_COLS, TMUX_DEFAULT_ROWS`. Avoid hardcoding row and column counts in components or storage modules.

*Rationale: Ensures UI and backend consistency for terminal viewport calculations.*

<!-- Pattern ID: d1f6810a-8fda-4018-97f2-7aab5be78a9b | Applied: 2025-12-30T09:59:25.581534 -->

## Secure SQL Parameterization

Use `psycopg.sql` for constructing dynamic SQL queries. Avoid Python f-strings or manual string formatting for SQL statements to prevent security vulnerabilities and ensure compatibility with parameterized execution.

*Rationale: Identified as a core focus of security hardening during recent refactoring tasks.*

<!-- Pattern ID: 557c9bc8-6482-43b7-89ce-edfe2081c2e5 | Applied: 2025-12-30T09:59:25.616656 -->

## Terminal Architecture Documentation Reference

Refer to `/home/kasadis/terminal/ARCHITECTURE_REDESIGN.md` for core architectural details of the terminal system. This file contains the primary design principles for scrolling and session management, distinct from library licensing files.

*Rationale: Found to be the key source of truth for the terminal's redesigned architecture.*

<!-- Pattern ID: dae3940d-bcb6-4e98-85df-0b8da6b1cca6 | Applied: 2025-12-30T13:09:10.409901 -->

## Terminal Resize Management

Use `ResizeObserver` within the Terminal component to handle responsive resizing. Ensure the terminal component manages its own addon lifecycle and disposal to prevent memory leaks during layout changes.

*Rationale: Successful implementation of responsive terminal resizing noted in session d620ed19.*

<!-- Pattern ID: 4a0aa943-bd81-451a-a360-f83bc44fda96 | Applied: 2025-12-30T18:06:26.717268 -->

## Terminal Claude State Polling Configuration

Set `CLAUDE_POLL_INTERVAL_MS` to 500 in `TerminalTabs.tsx` for state polling. Ensure the system handles all `ConnectionStatus` types: 'connecting', 'connected', 'disconnected', 'error', 'session_dead', and 'timeout'.

*Rationale: Identified as the standard polling mechanism for synchronizing Claude state with the frontend.*

<!-- Pattern ID: 20028590-7734-4830-8bf7-f6629a0ee4e0 | Applied: 2025-12-30T18:06:26.756080 -->

## Generic Terminal Session Creation

Use the `isGeneric` parameter in the `use-terminal-sessions` hook to create terminal sessions not associated with a specific project. This flag ensures the `project_id` is set to undefined in the session creation request.

*Rationale: Refactored the hook to support ad-hoc terminal sessions across the frontend.*

<!-- Pattern ID: e14fc161-59e8-4a92-8cfc-c70d9aadde3c | Applied: 2026-01-01T07:47:05.598129 -->

## Automated Refactoring Session Management

The `/og_refactor_it` command must operate without user prompts. Automatically resume an incomplete session if `REMAINING > 0` or start a new session if `REMAINING == 0` or no session is found. Never ask for user confirmation when initiating these transitions.

*Rationale: Documentation and logic updates in entry d3467766 explicitly enforce a non-interactive, automated workflow for refactoring orchestration.*

<!-- Pattern ID: aa736048-e07a-4670-894e-1d201bbe52d8 | Applied: 2026-01-01T09:59:44.839368 -->

## Terminal Session Normalization Utilities

Use `from .terminal_utils import SessionId, _to_str` for session identification and string normalization within terminal storage modules. This ensures architectural consistency and a single source of truth for session identifiers across the storage layer.

*Rationale: Observed in a successful refactoring session (0841b83e) where local definitions were replaced with imports from a centralized utility module to reduce duplication.*

<!-- Pattern ID: 5013a30b-81e9-4ddf-881c-15a061e41a61 | Applied: 2026-01-01T09:59:44.880823 -->

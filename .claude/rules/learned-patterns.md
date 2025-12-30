

## Terminal Project Management API Implementation

Implement terminal project lifecycle via: `POST /api/terminal/projects/{id}/reset` (shell initialization), `POST /api/terminal/projects/{id}/disable` (status updates), and `PUT /api/terminal/projects/{id}/mode` (mode toggling). Persist project display orders using `POST /api/terminal/project-settings/bulk-order` via the `settings_store`.

*Rationale: These endpoints were successfully implemented and verified to handle terminal state transitions correctly.*

<!-- Pattern ID: 1e62c0db-12e5-4b45-9ed5-6dd782ac849d | Applied: 2025-12-30T01:19:56.753557 -->

## Terminal Project Mode Naming Convention

Use the field name `active_mode` instead of `default_mode` for all terminal project state representations. This applies to database columns, settings upsert logic, and API response objects such as `ProjectResponse`.

*Rationale: A significant refactoring was performed to align architectural clarity and state representation across backend and frontend.*

<!-- Pattern ID: fd36c90d-c8c3-4ba5-80f5-21adf88a59d9 | Applied: 2025-12-30T01:19:56.788404 -->

## Safe Remote History Modification

Always use `git push --force-with-lease` instead of a standard force push when updating the main branch after squashing development checkpoints. This prevents overwriting remote changes that were not fetched locally.

*Rationale: Identified as the safe operational practice for pushing significant architectural changes and squashed commits.*

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


## Terminal Project Management API Implementation

Implement terminal project lifecycle via: `POST /api/terminal/projects/{id}/reset` (shell initialization), `POST /api/terminal/projects/{id}/disable` (status updates), and `PUT /api/terminal/projects/{id}/mode` (mode toggling). Persist project display orders using `POST /api/terminal/project-settings/bulk-order` via the `settings_store`.

*Rationale: These endpoints were successfully implemented and verified to handle terminal state transitions correctly.*

<!-- Pattern ID: 1e62c0db-12e5-4b45-9ed5-6dd782ac849d | Applied: 2025-12-30T01:19:56.753557 -->

## Terminal Project Mode Naming Convention

Use the field name `active_mode` instead of `default_mode` for all terminal project state representations. This applies to database columns, settings upsert logic, and API response objects such as `ProjectResponse`.

*Rationale: A significant refactoring was performed to align architectural clarity and state representation across backend and frontend.*

<!-- Pattern ID: fd36c90d-c8c3-4ba5-80f5-21adf88a59d9 | Applied: 2025-12-30T01:19:56.788404 -->
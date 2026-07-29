# Changelog

Notable changes to TaskFlow. This project follows
[Semantic Versioning](https://semver.org/) loosely: while it is pre-1.0, minor
versions may contain breaking changes, and those are always listed first.

**If you run TaskFlow, read the "Migrations" line of each release before
updating.** Pulling new code without applying its migrations will leave the app
throwing database errors — see [Updating](README.md#updating) for the procedure.

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-07-29

First public release. Everything below already existed; this is the point at
which the project became something other people can run.

### Added

- **In-app notifications.** A bell in the sidebar with an unread badge, a feed
  at `/notifications`, and a deep link on every entry to the exact task or
  comment it refers to. Covers assignment, field edits (including a card
  dragged to another column), comments, due-date warnings and account approval.
  Email stays for the interruption-worthy events only.
- **Hosted MCP endpoint** at `/api/mcp`, authorised by per-member personal
  access tokens generated in Settings → MCP. Calls run as that member through
  the same code the web UI uses, so permissions, validation and notifications
  all apply. Eight tools: `list_tasks`, `get_task`, `create_task`,
  `update_task`, `move_task`, `delete_task`, `add_comment`, `list_members`.
- **Settings is no longer admin-only** — every member manages their own MCP
  tokens there. Member management remains admin-only.
- **Full-screen image viewer** for any image in a description, comment or
  attachment: click, scroll or the toolbar to zoom, drag to pan, arrow keys to
  step through.
- **Clickable dashboard.** Every stat tile and breakdown row links into the
  list, filtered to exactly the tasks it counted.
- **URL filters on the list view** — `?status=`, `?priority=`, `?due=overdue`
  — so a filtered view can be linked and shared.
- Open-source scaffolding: MIT licence, contributing guide, security policy,
  code of conduct, issue and PR templates, and CI.

### Fixed

- Card action buttons (the dashboard's "Calendar" link, the attachments "Add"
  button, the MCP "New token" button) stretched full-width beneath their titles
  instead of sitting beside them. `CardHeader` is a grid, so the `flex-row`
  those three used never applied.

### Migrations

Two new migrations. Apply both before deploying this version:

- `20260729090000_taskflow_notifications.sql` — the `Notification` table
- `20260729140000_taskflow_api_tokens.sql` — the `ApiToken` table

### Known gaps

- No automated tests ([#2](https://github.com/malharlakdawala/taskflow/issues/2))
- Not usable on a phone ([#5](https://github.com/malharlakdawala/taskflow/issues/5))
- Tags exist in the schema with no UI ([#3](https://github.com/malharlakdawala/taskflow/issues/3))

[Unreleased]: https://github.com/malharlakdawala/taskflow/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/malharlakdawala/taskflow/releases/tag/v0.1.0

<h1 align="center">TaskFlow</h1>

<p align="center">
  A self-hosted, ClickUp-style task manager for small teams —<br>
  with a built-in MCP server, so your terminal is a first-class client.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-blue.svg"></a>
  <a href="https://github.com/malharlakdawala/taskflow/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/malharlakdawala/taskflow/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-black">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Postgres-3ecf8e">
</p>

---

Most task managers are either a hosted product you rent, or a self-hosted one
that your tools can't reach. TaskFlow is neither: you own the database, and
every member can point Claude Code, Cursor or any MCP client at it with a
personal token — no shared credential, no separate integration to configure.

**Board, list and calendar views. Rich text with pasted images. Comments,
attachments, assignees, due dates. In-app notifications and email digests. And
an MCP endpoint that runs as you, with the same permissions and the same
notifications as the web app.**

Deploy it on Vercel's free tier against a free Supabase project and it costs
nothing to run for a team.

## See it working

![TaskFlow walkthrough: dragging a card between columns, the notification feed, a task with rich text and comments, zooming an image, and a dashboard stat clicked through to a filtered list](docs/screenshots/demo.gif)

<sub>Dragging a card between columns · the notification feed · a task's rich
text, attachments and comments · zooming an image · a dashboard stat clicked
through to the filtered list it counted.</sub>

There is no hosted demo to log into — [run it locally](#run-it-locally-no-accounts-2-minutes)
instead. It takes about two minutes and needs no accounts.

## Screenshots

![The board](docs/screenshots/board.png)

| Dashboard | Task detail |
|---|---|
| [![Dashboard](docs/screenshots/dashboard.png)](docs/screenshots/dashboard.png) | [![Task detail](docs/screenshots/task-detail.png)](docs/screenshots/task-detail.png) |
| Every count links into the list, filtered to exactly the tasks it counted. | Rich text, attachments, comments and inline editing. |

| Notifications | Settings → MCP |
|---|---|
| [![Notifications](docs/screenshots/notifications.png)](docs/screenshots/notifications.png) | [![MCP settings](docs/screenshots/mcp-settings.png)](docs/screenshots/mcp-settings.png) |
| Assignments, comments, field edits and due-date warnings, each deep-linking to what changed. | Members generate their own token and copy a ready-made connect command. |

Also: a [list view](docs/screenshots/list.png) grouped by status with inline
editing and bulk actions, and a [full-screen image viewer](docs/screenshots/image-viewer.png)
for any picture in a description, comment or attachment.

<sub>All screenshots use invented data from a fictional plant-care team.</sub>

## Tech Stack

- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **UI Components:** shadcn/ui on Base UI
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **ORM:** Prisma 7 (driver adapter, `@prisma/adapter-pg`)
- **Rich Text:** Tiptap
- **Drag & Drop:** @hello-pangea/dnd
- **Terminal Integration:** Custom MCP server

## Features

- **Authentication** — Email/password sign-up and login via Supabase Auth
- **Kanban Board** — Drag and drop across status columns; position is persisted
- **Calendar View** — Tasks laid out by due date
- **Dashboard** — Stats overview with status and priority breakdowns. Every
  count is a link into the list, filtered to exactly the tasks it counted
- **List View** — Sortable, with multi-select and bulk edit of status, priority,
  assignee and due date in a single request. Filters live in the URL
  (`/list?status=IN_PROGRESS`, `?priority=URGENT`, `?due=overdue`), so a
  filtered view can be linked to and shared
- **Search** — `⌘K` (`Ctrl K`) from any screen, or the field at the top of the
  sidebar. Keywords are matched against task titles, descriptions, comments,
  project names and assignees, across every status — finished work included.
  Results say where the keywords were found and show the surrounding sentence,
  `"quoted phrases"` match exactly, and any search can be opened in the list
  view as `/list?q=…` to sort, filter or bulk-edit the matches
- **Assignees** — Pick an assignee on create or from the task detail view
- **Rich Text Editor** — Tiptap with headings, lists, code blocks, links, tables,
  and image upload by file picker, paste, or drag-and-drop
- **Image Viewer** — Any image in a description, comment or attachment list
  opens full-screen: click, scroll or the toolbar to zoom, drag to pan, arrow
  keys to step through the rest
- **Comments** — Per-task discussion
- **Notifications** — A bell in the sidebar with an unread badge, a full feed at
  `/notifications`, and a deep link on every entry that opens the exact task or
  comment it refers to. Covers assignments, field edits (including a card
  dragged to another column), comments, due-date warnings and account approval
- **File Attachments** — Uploads to Supabase Storage, recorded against the task
- **Admin Settings** — Approve or decline new sign-ups, manage roles
- **Dark Mode**
- **MCP** — Every member can connect their own terminal from Settings → MCP:
  generate a personal token and point Claude Code, Cursor or any MCP client at
  the hosted `/api/mcp` endpoint. Calls run as that member, with the same
  permissions and notifications as the web app

## Quick start

Two ways in. **Take the first one** unless you already know you want a hosted
database — it needs no accounts and no signup.

### Run it locally (no accounts, ~2 minutes)

Requires **Node.js 24**, **Docker** running, and the
[Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
git clone https://github.com/malharlakdawala/taskflow.git && cd taskflow
npm install
supabase start          # local Postgres + Auth + Storage, applies migrations
cp .env.example .env.local
```

`supabase start` prints an API URL, a publishable/anon key and a service_role
key. Put the first two in `.env.local`, set

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

then load it with a workspace to look at and start the app:

```bash
SUPABASE_SERVICE_ROLE_KEY=<the service_role key> npm run seed
npm run dev
```

Sign in as **ada@example.com / taskflow-demo** — an admin in a fictional
workspace of 20 tasks, comments and notifications. `npm run seed -- --reset`
puts it back whenever you've made a mess.

> `npm run seed` is the only thing that ever wants the service-role key, and it
> only wants it to create the demo accounts. Never put that key in `.env.local`
> permanently or in a deployment — it bypasses row level security.

### Or point it at a hosted Supabase project

For anything you intend to keep. Needs a **Supabase project** — the free tier
is plenty.

#### 1. Create a Supabase project

At [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
Note the database password; you'll need it in step 3.

#### 2. Create the schema

Every table, trigger, RLS policy and the storage bucket is defined in
`supabase/migrations/`. Apply them **in filename order** — later ones amend
earlier ones, so order matters.

With the [Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or without it: open the SQL Editor in the dashboard and paste each file from
`supabase/migrations/` in order, oldest first.

#### 3. Configure the environment

```bash
cp .env.example .env.local
```

| Variable | Where to find it | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API (publishable key) | yes |
| `DATABASE_URL` | Connect → ORMs → Prisma (Transaction pooler, **port 6543**) | yes |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS` | [Brevo](https://app.brevo.com) — free tier, 300/day | no |
| `CRON_SECRET` | `openssl rand -hex 32` | for the daily digest |

Two things people get wrong here:

- **Don't append `?schema=taskflow` to `DATABASE_URL`.** The schema is selected
  by the driver adapter in `src/lib/prisma.ts`.
- **No service-role key.** Nothing needs one, and adding it would put a key
  that bypasses row level security into your deployment.

Leave the email variables unset and the app simply sends no mail — everything
else works, and notifications still appear in-app.

#### 4. Run it

```bash
npm install     # also runs `prisma generate`
npm run dev
```

Open [localhost:3000](http://localhost:3000) and sign up. **The first account
becomes the admin and is active immediately**; everyone after that waits for
your approval.

To start with the demo workspace instead of an empty one, run `npm run seed`
(see above for the service-role key caveat).

### Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmalharlakdawala%2Ftaskflow&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,DATABASE_URL&envDescription=Supabase%20project%20URL%2C%20publishable%20key%2C%20and%20the%20transaction-pooler%20connection%20string)

Then add your deployment URL to Supabase → Authentication → URL Configuration →
Redirect URLs, or email confirmation links won't resolve. See
[Deploying to Vercel](#deploying-to-vercel) for the rest.

## Updating

**Forking takes a snapshot.** Nothing is pushed to your copy afterwards — if
you want later changes you have to pull them deliberately. Watch this repo
(**Watch → Custom → Releases**) to hear when there is something worth pulling;
stars notify nobody of anything.

To update a fork:

```bash
git remote add upstream https://github.com/malharlakdawala/taskflow.git   # once
git fetch upstream
git merge upstream/main          # or: rebase, or GitHub's "Sync fork" button
npm install                      # dependencies may have moved
```

Then — and this is the step people miss — **apply any new migrations**:

```bash
supabase db push                 # or paste the new files from supabase/migrations/
```

New code against an old schema doesn't fail gracefully; it throws Prisma errors
that look like the app is broken. [CHANGELOG.md](CHANGELOG.md) lists the
migrations each release needs, so check it before deploying.

If you deployed to Vercel from your fork, pushing to your `main` redeploys
automatically. The database is never touched by a deploy — that part is always
yours to run.

## Architecture Notes

Two things are non-obvious and worth knowing before you change anything:

**Tables live in the `taskflow` schema, not `public`.** Namespacing means you
can point TaskFlow at a Supabase project you're already using for something
else without the two colliding. The schema is selected at runtime by the driver
adapter in `src/lib/prisma.ts` — do **not** append `?schema=` to
`DATABASE_URL`.

**`taskflow."User"` mirrors `auth.users` and shares its uuid.** An
`on_auth_user_created` trigger inserts the application row whenever someone
signs up, so `auth.uid()` can be used directly as a foreign key — which is why
`getAppUser()` in `src/lib/auth.ts` is a plain indexed lookup rather than an
upsert.

DDL is owned by Supabase migrations rather than `prisma migrate`.
`prisma/schema.prisma` describes the existing tables so Prisma can query them;
if you change it, apply a matching SQL migration in Supabase.

**Notifications fan out on write, and pick their channel per event.**
`src/lib/notifications/dispatch.ts` is the single place that decides who hears
about something. It writes one `Notification` row per recipient when the event
happens, so reading a feed is one indexed query with no joins. Every event
lands in the in-app feed; only the interruption-worthy ones — assignment,
comment, approval, the due-date digest — also send email. Field edits stay in
the bell, because a status nudge does not belong in anyone's inbox. Everything
runs inside `after()`, and every failure is logged and swallowed: a notification
must never be able to fail the write that triggered it.

## Membership and Roles

The first account to sign up becomes an **admin** and is active immediately.
Every later sign-up lands in a **pending** state and sees only an approval
screen — no task data is sent to the browser at all, because the check runs in
the `(dashboard)` server layout before any markup is produced.

Admins get a **Settings** page to approve, decline, revoke, and promote members.
Two safeguards: you cannot change your own role or status, and the last active
admin cannot be demoted or removed.

Membership does not have to start with the other person, though. **Settings →
Members → Invite people** takes one address or a pasted list of them, and sends
each a link that lets them in with no approval step — an invitation *is* the
approval. Paste in an address that has already signed up and there is nothing to
invite, so that person is simply let in; the same button covers both. Sending as
**Admin** is a choice at the point of inviting.

An invitation link carries a 256-bit token of which only the SHA-256 hash is
stored, expires after a fortnight, and works only for the address it was
addressed to — accepting compares the signed-in account's email against the
invitation, so a forwarded link gets a colleague nowhere. Because the link is
the thing that grants access, the settings screen shows it for copying: **with
no email configured, invitations still work** — you pass the link on yourself.
Nothing is emailed from a demo instance, for the same reason its admin password
is public.

## Performance Notes

This was built against a database in `ap-northeast-1` (Tokyo), where each
round-trip from elsewhere is expensive enough to dominate page load. Three
things keep request counts down — undo them at your peril:

- **`getClaims()`, not `getUser()`** (`src/lib/auth.ts`, `src/lib/supabase/session.ts`).
  Tokens are ES256 with a published JWKS, so the signature is verified locally.
  `getUser()` calls the Auth server, which measured 150–500ms *per request*, and
  it ran twice per request (proxy + route).
- **`relationLoadStrategy: "join"`** on task queries. Prisma otherwise issues one
  query per relation, turning a board load into ~6 sequential round-trips.
- **List endpoints return counts, not arrays.** `TASK_LIST_SELECT` omits comments
  and attachments; only the detail view loads them.

`vercel.json` pins functions to `hnd1` (Tokyo) so the server sits beside the
database. **Change this to match your own Supabase region** — leaving it will
put every request on the wrong side of the planet. Vercel's region list is in
their [regions docs](https://vercel.com/docs/edge-network/regions).

## Security Model

- All application tables have RLS enabled; `anon` has no grants at all, and the
  `taskflow` schema is not exposed to the Data API.
- RLS mirrors the approval model: `taskflow.is_active_member()` gates task data
  and `taskflow.is_admin()` gates member management.
- Attachment URLs are public and unguessable (uuid-prefixed), but the bucket
  cannot be listed — there is no SELECT policy on `storage.objects`, so nobody
  can enumerate uploads. Writes are confined to the uploader's own `<uid>/` prefix.
- The workspace is **shared** — every *approved* user can see and edit every
  task. Comments can only be edited or deleted by their author, and
  notifications and MCP tokens are private to one person.
- Sign-up is open but grants nothing: new accounts sit in `PENDING` until an
  admin approves them, and the server layout refuses to render task data to
  them. You can close sign-ups entirely in Supabase → Authentication →
  Providers if you'd rather not field the requests.
- **Invitations are claimed with the token, never with the email address.** A
  session is required to accept, the session's address must be the invited one,
  and the token proves the holder received the mail. Matching on the address
  alone would mean that on a project with email confirmation switched off,
  anyone could type a colleague's address into the sign-up form and be let in.
- API routes validate every payload with Zod and write only allow-listed
  columns.
- MCP personal access tokens are stored as SHA-256 hashes and scoped to one
  member. See [SECURITY.md](SECURITY.md) for the full model and for how to
  report a vulnerability.

## MCP — Terminal Integration

There are two ways to drive TaskFlow from an MCP client. **The hosted endpoint
is the one to give people.**

### Hosted endpoint (`/api/mcp`) — for everyone

Each member opens **Settings → MCP**, generates a personal token, and copies
the connect command:

```bash
claude mcp add --transport http taskflow https://your-app/api/mcp \
  --header "Authorization: Bearer tf_live_…"
```

The token authorises the endpoint to act as that one member. Requests run
through the same Prisma code the web UI uses, so permissions, validation and
notifications all apply — a task assigned from a terminal reaches its new owner
exactly as one assigned from the board does. Only a SHA-256 hash of the token
is stored; the plaintext is shown once, at creation, and revoking is immediate.

| Hosted tool | Description |
|-------------|-------------|
| `list_tasks` | List tasks with status, priority, assignee and project filters |
| `search_tasks` | Search task titles, with optional status and priority filters |
| `get_task` | Get one task with its comments and attachments |
| `create_task` | Create and assign a task |
| `update_task` | Update a task's fields |
| `move_task` | Change only a task's status |
| `delete_task` | Delete a task |
| `add_comment` | Comment on a task |
| `list_members` | List approved members available for assignment |
| `list_projects` | List projects and task counts |
| `create_project` | Create a project |

The transport is Streamable HTTP in JSON mode — one JSON-RPC request per POST,
no SSE stream and no session id, because every call is a single database
round-trip. It is implemented directly rather than through the SDK's
`StreamableHTTPServerTransport`, which is written against Node's
`IncomingMessage`/`ServerResponse` while a route handler is handed a Web
`Request`.

### Local stdio server (`mcp-server/`) — for whoever owns the database

`mcp-server/` connects **directly to Postgres**, because the `taskflow` schema
is intentionally not reachable with the public anon key.

> **Running it requires `DATABASE_URL`, which reaches every table in the
> project — including the other application's tables in `public`.** Do not hand
> it to team members; point them at the hosted endpoint instead.

### Setup

```bash
cd mcp-server
cp .env.example .env     # DATABASE_URL + TASKFLOW_USER_EMAIL
npm install
npm run build
```

`TASKFLOW_USER_EMAIL` decides which account the server acts as when creating
tasks and comments. It must be an account that has already signed up in the web
app; if unset, the earliest registered user is used.

### Available Tools

| Tool | Description |
|------|-------------|
| `create_task` | Create a task with title, description, status, priority, due date, assignee |
| `list_tasks` | List tasks with optional status/priority filters |
| `get_task` | Full details of one task, including comments and attachments |
| `update_task` | Update title, description, status, priority or due date |
| `delete_task` | Delete a task by ID |
| `add_comment` | Add a comment to a task |
| `list_users` | List users available for assignment |

### Connect to Your CLI

**Claude Code:**
```bash
claude mcp add todo-server -- node /absolute/path/to/mcp-server/build/index.js
```

**OpenCode** (add to `~/.config/opencode/opencode.json`):
```json
{
  "mcp": {
    "todo-server": {
      "type": "local",
      "command": ["node", "/absolute/path/to/mcp-server/build/index.js"],
      "enabled": true
    }
  }
}
```

**Cursor** (add to `~/.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "todo-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/build/index.js"]
    }
  }
}
```

### Example: Create a Task from Terminal

> "Create a task called 'Fix login bug' with high priority and due tomorrow"

The task appears in the web app on the next refresh.

## Deploying to Vercel

1. Import the repository in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `DATABASE_URL` as environment variables.
3. Deploy. `prisma generate` runs automatically via `postinstall`.

Use the **Transaction pooler** connection string (port 6543) — the direct
connection will exhaust Postgres connections on serverless.

After the first deploy, add your Vercel URL to Supabase → Authentication → URL
Configuration → Redirect URLs so email confirmation links resolve correctly.

## Project Structure

```
supabase/migrations/     # Source of truth for the database schema
src/
├── proxy.ts             # Route protection. Next 16 renamed middleware → proxy;
│                        # it must sit beside app/, so inside src/ — not the repo root.
├── app/
│   ├── (auth)/          # Login & signup pages
│   ├── (dashboard)/     # Dashboard, board, list, calendar, notifications, task detail
│   ├── api/             # Route handlers (tasks, comments, attachments, users,
│   │                    # notifications)
│   └── auth/callback/   # Email confirmation / OAuth callback
├── components/
│   ├── editor/          # Tiptap rich text editor
│   ├── notifications/   # Sidebar bell + feed row
│   ├── search/          # ⌘K search palette
│   ├── tasks/           # Task cards, creation dialog, comments
│   ├── ui/              # shadcn/ui components
│   └── sidebar.tsx      # Navigation sidebar
├── lib/
│   ├── auth.ts          # Session helpers + auth-to-User reconciliation
│   ├── email/           # Brevo client + email markup
│   ├── mcp/             # Personal access tokens + the hosted MCP tools
│   ├── notifications/   # Who gets told what, over which channel
│   ├── prisma.ts        # Prisma client singleton (taskflow schema)
│   ├── search/          # Keyword parsing + the cross-task search query
│   ├── storage.ts       # Supabase Storage upload helpers
│   ├── supabase/        # Supabase clients (browser, server, session)
│   ├── tasks.ts         # Shared query shape + serialisation
│   ├── types.ts         # Shared types and display config
│   ├── use-notifications.ts  # Shared feed store + polling
│   └── validation.ts    # Zod request schemas
└── generated/prisma/    # Generated Prisma client (gitignored)
```

## Contributing

Bug fixes, docs and accessibility improvements are welcome without asking.
For anything larger, please open an issue first — see
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, house style, and the things
worth knowing before you touch the data layer.

**Looking for somewhere to start?** The
[open issues](https://github.com/malharlakdawala/taskflow/issues) are written
with pointers into the code rather than one-line wishes.
[`good first issue`](https://github.com/malharlakdawala/taskflow/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
is the shortlist. A few that would help most:

- [#1 A seed script](https://github.com/malharlakdawala/taskflow/issues/1) — makes the app evaluable in one command
- [#2 A test runner](https://github.com/malharlakdawala/taskflow/issues/2) — there is no test suite yet, and that's a gap rather than a decision
- [#3 Finish tags](https://github.com/malharlakdawala/taskflow/issues/3) — the tables exist, the UI doesn't
- [#5 Make it work on a phone](https://github.com/malharlakdawala/taskflow/issues/5) — the sidebar has no breakpoints at all
- [#10 Local dev with the Supabase CLI](https://github.com/malharlakdawala/taskflow/issues/10) — no hosted project needed to try it

## Licence

[MIT](LICENSE) © Malhar Lakdawala

Use it, fork it, run it for your team, sell it. If it's useful, a star is
appreciated.

# TaskFlow — ClickUp-Style Task Manager

A task management web app with rich text editing, a Kanban board, and terminal
integration over the Model Context Protocol.

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
- **List View** — Sortable table of all tasks
- **Calendar View** — Tasks laid out by due date
- **Dashboard** — Stats overview with status and priority breakdowns
- **Rich Text Editor** — Tiptap with headings, lists, code blocks, links, images, tables
- **Comments** — Per-task discussion
- **File Attachments** — Uploads to Supabase Storage, recorded against the task
- **Dark Mode**
- **MCP Server** — Manage tasks from the terminal

## Architecture Notes

Two things are non-obvious and worth knowing before you change anything:

**Tables live in the `taskflow` schema, not `public`.** This Supabase project is
shared with another application, so TaskFlow is namespaced to keep the two
apart. The schema is selected at runtime by the driver adapter in
`src/lib/prisma.ts` — do **not** append `?schema=` to `DATABASE_URL`.

**`taskflow."User"` mirrors `auth.users` and shares its uuid.** An
`on_auth_user_created` trigger inserts the application row whenever someone
signs up, so `auth.uid()` can be used directly as a foreign key.
`getCurrentDbUser()` in `src/lib/auth.ts` re-upserts as a safety net.

DDL is owned by Supabase migrations rather than `prisma migrate`.
`prisma/schema.prisma` describes the existing tables so Prisma can query them;
if you change it, apply a matching SQL migration in Supabase.

## Getting Started

### 1. Configure environment

```bash
cp .env.example .env.local
```

Fill in from the Supabase dashboard:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API (publishable key) |
| `DATABASE_URL` | Connect → ORMs → Prisma (Transaction pooler, port 6543) |

No service-role key is needed — every write runs as the signed-in user so row
level security stays in force.

### 2. Install and run

```bash
npm install     # also runs `prisma generate`
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000), create an account, and
you're in.

### Database setup

The schema, the auth sync trigger, the RLS policies, and the
`task-attachments` storage bucket are already provisioned. To recreate them on a
fresh project, replay the migrations in `supabase/migrations/` in order.

## Security Model

- All application tables have RLS enabled; `anon` has no grants at all, and the
  `taskflow` schema is not exposed to the Data API.
- Attachment URLs are public and unguessable (uuid-prefixed), but the bucket
  cannot be listed — there is no SELECT policy on `storage.objects`, so nobody
  can enumerate uploads. Writes are confined to the uploader's own `<uid>/` prefix.
- The workspace is **shared** — every signed-in user can see and edit every
  task. Comments can only be edited or deleted by their author.
- Because signing up grants full access, keep sign-ups closed or restricted in
  Supabase → Authentication → Providers once your own account exists.
- API routes validate every payload with Zod and write only allow-listed
  columns.

## MCP Server — Terminal Integration

`mcp-server/` is a standalone MCP server for managing tasks from any
MCP-compatible client (Claude Code, Cursor, OpenCode…).

It connects **directly to Postgres**, not through the Supabase REST API,
because the `taskflow` schema is intentionally not reachable with the public
anon key.

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
│   ├── (dashboard)/     # Dashboard, board, list, calendar, task detail
│   ├── api/             # Route handlers (tasks, comments, attachments, users)
│   └── auth/callback/   # Email confirmation / OAuth callback
├── components/
│   ├── editor/          # Tiptap rich text editor
│   ├── tasks/           # Task cards, creation dialog, comments
│   ├── ui/              # shadcn/ui components
│   └── sidebar.tsx      # Navigation sidebar
├── lib/
│   ├── auth.ts          # Session helpers + auth-to-User reconciliation
│   ├── prisma.ts        # Prisma client singleton (taskflow schema)
│   ├── storage.ts       # Supabase Storage upload helpers
│   ├── supabase/        # Supabase clients (browser, server, session)
│   ├── tasks.ts         # Shared query shape + serialisation
│   ├── types.ts         # Shared types and display config
│   └── validation.ts    # Zod request schemas
└── generated/prisma/    # Generated Prisma client (gitignored)
```

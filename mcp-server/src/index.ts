#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pg from "pg";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// MCP clients launch this server from an arbitrary working directory, so the
// .env file has to be resolved relative to the script rather than to cwd.
// Loading it via "dotenv/config" would silently find nothing and the server
// would exit on startup with only "Connection closed" at the client.
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../.env"), quiet: true });

/**
 * Talks to Postgres directly rather than through the Supabase REST API.
 *
 * TaskFlow's tables live in the `taskflow` schema, which is deliberately not
 * exposed to the Data API — and the public anon key must not have write access
 * to them regardless. A direct pooled connection is both the only route in and
 * the correct trust boundary for a local terminal tool.
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set. Copy mcp-server/.env.example to mcp-server/.env " +
      "and paste the Supabase connection string."
  );
  process.exit(1);
}

/** Comments need an author; this is the account the MCP server acts as. */
const ACTING_USER_EMAIL = process.env.TASKFLOW_USER_EMAIL;

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 3,
  // Supabase's pooler drops idle clients; keep the pool small and patient.
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

const ok = (payload: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
});

const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/** Wraps a handler so a thrown error becomes a readable tool error. */
async function guard(
  action: string,
  handler: () => Promise<ToolResult>
): Promise<ToolResult> {
  try {
    return await handler();
  } catch (err) {
    return fail(
      `Error ${action}: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}

async function resolveActingUserId(): Promise<string> {
  if (ACTING_USER_EMAIL) {
    const { rows } = await pool.query<{ id: string }>(
      'select id from taskflow."User" where email = $1',
      [ACTING_USER_EMAIL]
    );
    if (rows.length === 0) {
      throw new Error(
        `No TaskFlow user with email ${ACTING_USER_EMAIL}. Sign up in the web app first.`
      );
    }
    return rows[0].id;
  }

  const { rows } = await pool.query<{ id: string }>(
    'select id from taskflow."User" order by "createdAt" asc limit 1'
  );
  if (rows.length === 0) {
    throw new Error(
      "No TaskFlow users exist yet. Sign up in the web app first, then set " +
        "TASKFLOW_USER_EMAIL in mcp-server/.env."
    );
  }
  return rows[0].id;
}

const server = new McpServer({ name: "todo-mcp-server", version: "1.0.0" });

server.tool(
  "create_task",
  "Create a new task in TaskFlow",
  {
    title: z.string().describe("Task title"),
    description: z.string().optional().describe("Task description"),
    status: z.enum(STATUSES).optional().describe("Task status (default: TODO)"),
    priority: z
      .enum(PRIORITIES)
      .optional()
      .describe("Task priority (default: NONE)"),
    due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    assignee_email: z
      .string()
      .optional()
      .describe("Email of the user to assign the task to"),
  },
  async ({ title, description, status, priority, due_date, assignee_email }) =>
    guard("creating task", async () => {
      let assigneeId: string | null = null;
      if (assignee_email) {
        const { rows } = await pool.query<{ id: string }>(
          'select id from taskflow."User" where email = $1',
          [assignee_email]
        );
        if (rows.length === 0) {
          return fail(`No TaskFlow user with email ${assignee_email}`);
        }
        assigneeId = rows[0].id;
      }

      const createdById = await resolveActingUserId().catch(() => null);
      const resolvedStatus = status ?? "TODO";

      const { rows } = await pool.query(
        `insert into taskflow."Task"
           (title, description, status, priority, "dueDate", "order", "assigneeId", "createdById")
         values (
           $1, $2, $3::taskflow.task_status, $4::taskflow.task_priority, $5::timestamptz,
           coalesce((select max("order") from taskflow."Task"
                      where status = $3::taskflow.task_status), 0) + 1000,
           coalesce($6::uuid, $7::uuid), $7::uuid
         )
         returning id, title, status, priority, "dueDate", "createdAt"`,
        [
          title,
          description ? JSON.stringify(description) : null,
          resolvedStatus,
          priority ?? "NONE",
          due_date ? new Date(due_date).toISOString() : null,
          assigneeId,
          createdById,
        ]
      );

      return ok({ success: true, task: rows[0] });
    })
);

server.tool(
  "list_tasks",
  "List all tasks with optional filters",
  {
    status: z.enum(STATUSES).optional().describe("Filter by status"),
    priority: z.enum(PRIORITIES).optional().describe("Filter by priority"),
    limit: z
      .number()
      .optional()
      .describe("Max number of tasks to return (default: 20)"),
  },
  async ({ status, priority, limit }) =>
    guard("listing tasks", async () => {
      const { rows } = await pool.query(
        `select t.id, t.title, t.status, t.priority, t."dueDate", t."createdAt",
                u.email as "assigneeEmail"
           from taskflow."Task" t
           left join taskflow."User" u on u.id = t."assigneeId"
          where ($1::taskflow.task_status is null or t.status = $1::taskflow.task_status)
            and ($2::taskflow.task_priority is null or t.priority = $2::taskflow.task_priority)
          order by t."createdAt" desc
          limit $3`,
        [status ?? null, priority ?? null, limit ?? 20]
      );

      return ok({ success: true, count: rows.length, tasks: rows });
    })
);

server.tool(
  "get_task",
  "Get detailed information about a specific task",
  { task_id: z.string().describe("Task ID") },
  async ({ task_id }) =>
    guard("getting task", async () => {
      const { rows } = await pool.query(
        `select t.*,
                u.email as "assigneeEmail",
                coalesce(
                  (select json_agg(json_build_object(
                            'id', c.id, 'content', c.content,
                            'author', a.email, 'createdAt', c."createdAt")
                          order by c."createdAt" desc)
                     from taskflow."Comment" c
                     join taskflow."User" a on a.id = c."authorId"
                    where c."taskId" = t.id), '[]'::json) as comments,
                coalesce(
                  (select json_agg(json_build_object(
                            'id', at.id, 'filename', at.filename, 'url', at.url)
                          order by at."createdAt")
                     from taskflow."Attachment" at
                    where at."taskId" = t.id), '[]'::json) as attachments
           from taskflow."Task" t
           left join taskflow."User" u on u.id = t."assigneeId"
          where t.id = $1`,
        [task_id]
      );

      if (rows.length === 0) return fail(`No task with id ${task_id}`);
      return ok({ success: true, task: rows[0] });
    })
);

server.tool(
  "update_task",
  "Update an existing task",
  {
    task_id: z.string().describe("Task ID"),
    title: z.string().optional().describe("New title"),
    description: z.string().optional().describe("New description"),
    status: z.enum(STATUSES).optional().describe("New status"),
    priority: z.enum(PRIORITIES).optional().describe("New priority"),
    due_date: z.string().optional().describe("New due date (YYYY-MM-DD)"),
  },
  async ({ task_id, title, description, status, priority, due_date }) =>
    guard("updating task", async () => {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (title !== undefined) push("title", title);
      if (description !== undefined) {
        push("description", description ? JSON.stringify(description) : null);
      }
      if (status !== undefined) {
        values.push(status);
        sets.push(`status = $${values.length}::taskflow.task_status`);
      }
      if (priority !== undefined) {
        values.push(priority);
        sets.push(`priority = $${values.length}::taskflow.task_priority`);
      }
      if (due_date !== undefined) {
        push('"dueDate"', due_date ? new Date(due_date).toISOString() : null);
      }

      if (sets.length === 0) return fail("No fields to update");

      values.push(task_id);
      const { rows } = await pool.query(
        `update taskflow."Task" set ${sets.join(", ")}
          where id = $${values.length}
          returning id, title, status, priority, "dueDate", "updatedAt"`,
        values
      );

      if (rows.length === 0) return fail(`No task with id ${task_id}`);
      return ok({ success: true, task: rows[0] });
    })
);

server.tool(
  "delete_task",
  "Delete a task",
  { task_id: z.string().describe("Task ID to delete") },
  async ({ task_id }) =>
    guard("deleting task", async () => {
      const { rowCount } = await pool.query(
        'delete from taskflow."Task" where id = $1',
        [task_id]
      );
      if (!rowCount) return fail(`No task with id ${task_id}`);
      return ok({ success: true, message: `Task ${task_id} deleted` });
    })
);

server.tool(
  "add_comment",
  "Add a comment to a task",
  {
    task_id: z.string().describe("Task ID"),
    content: z.string().describe("Comment content"),
  },
  async ({ task_id, content }) =>
    guard("adding comment", async () => {
      const authorId = await resolveActingUserId();

      const { rows } = await pool.query(
        `insert into taskflow."Comment" (content, "taskId", "authorId")
         values ($1::jsonb, $2::uuid, $3::uuid)
         returning id, content, "createdAt"`,
        [JSON.stringify(content), task_id, authorId]
      );

      return ok({ success: true, comment: rows[0] });
    })
);

server.tool("list_users", "List all users in the system", {}, async () =>
  guard("listing users", async () => {
    const { rows } = await pool.query(
      'select id, email, name, "avatarUrl" from taskflow."User" order by email'
    );
    return ok({ success: true, count: rows.length, users: rows });
  })
);

server.resource("server-info", "info://server", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      mimeType: "application/json",
      text: JSON.stringify(
        {
          name: "todo-mcp-server",
          version: "1.0.0",
          description: "MCP server for TaskFlow terminal integration",
          actingUser: ACTING_USER_EMAIL ?? "(first registered user)",
          tools: [
            "create_task",
            "list_tasks",
            "get_task",
            "update_task",
            "delete_task",
            "add_comment",
            "list_users",
          ],
        },
        null,
        2
      ),
    },
  ],
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TaskFlow MCP server running on stdio");
}

const shutdown = async () => {
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import "server-only";

import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth";
import { accessibleProjectsFilter, accessibleTasksFilter, getProjectRole } from "@/lib/project-access";
import { PROJECT_COLORS, type ProjectColor } from "@/lib/types";
import { sanitizeOrNull } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";
import { toPlainText } from "@/lib/utils";
import {
  describeTaskValues,
  notifyCommentAdded,
  notifyTaskAssigned,
  notifyTaskUpdated,
  summarizeTaskChanges,
  type TaskSnapshot,
} from "@/lib/notifications/dispatch";

/**
 * The tools the hosted MCP endpoint exposes.
 *
 * Everything here goes through Prisma as the member who owns the token, and
 * raises the same notifications the web UI does — a task assigned from a
 * terminal has to reach its new owner exactly as one assigned from the board
 * does, or the two interfaces quietly disagree about what happened.
 *
 * Deliberately a smaller surface than the REST API: no attachments (there is
 * no file to upload over stdio), no bulk edit, no reordering. These are the
 * operations that make sense to ask for in a sentence.
 *
 * Projects can be listed, created, and filed into, but not renamed, archived
 * or deleted — reshaping how a workspace is organised is a decision someone
 * should make on the projects screen, where the task counts are visible.
 *
 * Phases are the exception, deliberately: splitting a big project into stages
 * and filing its tasks into them is exactly the kind of bulk restructuring an
 * agent is good at. Deleting a phase never deletes work — its tasks stay in
 * the project, unphased.
 */

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"] as const;

/**
 * MCP wants JSON Schema to advertise a tool; the handler wants a parser to
 * trust its input. Both are declared, and the endpoint runs `schema` over the
 * arguments before `run` ever sees them — so the cast at the top of each
 * handler is describing what validation already guaranteed.
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: z.ZodType;
  run: (args: unknown, actor: AppUser) => Promise<unknown>;
}

const str = (description: string) => ({ type: "string", description });
const enumOf = (values: readonly string[], description: string) => ({
  type: "string",
  enum: [...values],
  description,
});

const object = (
  properties: Record<string, unknown>,
  required: string[] = []
) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});

/**
 * Rich text arrives from an agent as Markdown far more often than as HTML.
 * `toRichHtml` gives that its structure back — headings, lists, fenced code —
 * and content that already is HTML passes through untouched.
 */
const asStoredRichText = (value: string | null | undefined) =>
  sanitizeOrNull(toRichHtml(value));

const notFound = (id: string) => {
  throw new McpToolError(`No task with id ${id}`);
};

/** A failure the caller can act on, rendered as an MCP tool error. */
export class McpToolError extends Error {}

/** What every tool returns for a task, trimmed to what an agent can use. */
const TASK_SUMMARY = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { email: true, name: true } },
  // Named, not id'd: the name is what every project argument here expects back.
  project: { select: { name: true } },
  // Same: what the `phase` argument expects back. Null when unphased.
  phase: { select: { name: true } },
  // The raw id, kept internal to this module — every tool needs it to check
  // project access, even though callers only ever ask for a project by name.
  projectId: true,
} satisfies Prisma.TaskSelect;

/**
 * Same rule the REST API enforces, applied to the MCP surface: a token acts as
 * one member, so it gets exactly that member's project access, not a bypass of
 * it. `taskId`, when given, makes a denial read as "no such task" rather than
 * "forbidden" — a token holder should not learn that a task exists in a
 * project they cannot see.
 */
async function requireProjectAccess(
  actor: AppUser,
  projectId: string | null,
  minRole: "VIEWER" | "EDITOR",
  taskId?: string
): Promise<void> {
  if (projectId === null || actor.role === "ADMIN") return;

  const role = await getProjectRole(actor.id, projectId);
  if (role === null) {
    if (taskId) notFound(taskId);
    throw new McpToolError("You don't have access to that project");
  }
  if (minRole === "EDITOR" && role !== "EDITOR") {
    throw new McpToolError("You have read-only access to that project");
  }
}

async function resolveAssignee(email: string | undefined): Promise<string | null> {
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!user) throw new McpToolError(`No TaskFlow member with email ${email}`);
  if (user.status !== "ACTIVE") {
    throw new McpToolError(`${email} is not an approved member`);
  }
  return user.id;
}

/**
 * Projects are addressed by name rather than id, for the same reason members
 * are addressed by email: an agent should be able to name a thing the way a
 * person would. Matching is case-insensitive, exactly as the unique index is,
 * so "website" finds "Website".
 *
 * Scoped to what `actor` can see at all (VIEWER or above) — a project they
 * have zero access to has to read as "no project by that name", the same as
 * one that genuinely doesn't exist. Resolving it first and only rejecting
 * afterward, in a caller that checks EDITOR access, would let a token holder
 * learn a restricted project exists (and its exact name) just from which of
 * the two error messages comes back.
 *
 * `forFiling` is the difference between reading and writing. Filtering a list
 * by an archived project is reasonable; putting new work into one is almost
 * certainly a mistake, because archived projects have left every picker.
 */
async function resolveProject(
  actor: AppUser,
  name: string | undefined,
  { forFiling = false }: { forFiling?: boolean } = {}
): Promise<string | null> {
  if (!name) return null;

  const project = await prisma.project.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...accessibleProjectsFilter(actor),
    },
    select: { id: true, name: true, archived: true },
  });

  if (!project) throw new McpToolError(`No project called "${name}"`);
  if (forFiling && project.archived) {
    throw new McpToolError(
      `"${project.name}" is archived — unarchive it before filing work there`
    );
  }
  return project.id;
}

/**
 * Phases are addressed by name within their project, the same way projects
 * are addressed by name. Case-insensitive, matching the unique index. The
 * caller has already resolved — and access-checked — the project.
 */
async function resolvePhase(projectId: string | null, name: string): Promise<string> {
  if (projectId === null) {
    throw new McpToolError("A phase only exists inside a project — pass project too");
  }
  const phase = await prisma.phase.findFirst({
    where: { projectId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (!phase) {
    throw new McpToolError(`No phase called "${name}" in that project — see list_phases`);
  }
  return phase.id;
}

/** YYYY-MM-DD or a full ISO timestamp; anything else is rejected loudly. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new McpToolError(`Could not read "${value}" as a date`);
  }
  return date;
}

const createTask: McpTool = {
  name: "create_task",
  description:
    "Create a task. Defaults to TODO, no priority, and assigns it to you " +
    "unless assignee_email is given.",
  inputSchema: object(
    {
      title: str("Task title"),
      description: str("Task description. Markdown is supported."),
      status: enumOf(STATUSES, "Defaults to TODO"),
      priority: enumOf(PRIORITIES, "Defaults to NONE"),
      start_date: str("Planned start date as YYYY-MM-DD"),
      due_date: str("Due date as YYYY-MM-DD"),
      assignee_email: str("Member to assign it to. Defaults to you."),
      project: str("Project name to file it under. Defaults to unfiled."),
      phase: str("Phase name within that project. Requires project."),
    },
    ["title"]
  ),
  schema: z.object({
    title: z.string().trim().min(1).max(500),
    description: z.string().max(100_000).optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    assignee_email: z.string().optional(),
    project: z.string().optional(),
    phase: z.string().optional(),
  }),
  async run(args, actor) {
    const input = args as {
      title: string;
      description?: string;
      status?: (typeof STATUSES)[number];
      priority?: (typeof PRIORITIES)[number];
      start_date?: string;
      due_date?: string;
      assignee_email?: string;
      project?: string;
      phase?: string;
    };

    const assigneeId = await resolveAssignee(input.assignee_email);
    const projectId = await resolveProject(actor, input.project, { forFiling: true });
    await requireProjectAccess(actor, projectId, "EDITOR");
    const phaseId = input.phase ? await resolvePhase(projectId, input.phase) : null;
    const status = input.status ?? "TODO";

    // Same ordering rule as the REST route: new work lands at the bottom of
    // its column rather than silently jumping the queue.
    const last = await prisma.task.findFirst({
      where: { status },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const task = await prisma.task.create({
      data: {
        title: input.title,
        description: asStoredRichText(input.description) ?? undefined,
        status,
        priority: input.priority ?? "NONE",
        startDate: parseDate(input.start_date) ?? undefined,
        dueDate: parseDate(input.due_date) ?? undefined,
        order: (last?.order ?? 0) + 1000,
        assigneeId: assigneeId ?? actor.id,
        projectId,
        phaseId,
        createdById: actor.id,
      },
      select: TASK_SUMMARY,
    });

    after(() =>
      notifyTaskAssigned({
        taskId: task.id,
        assigneeId: assigneeId ?? actor.id,
        previousAssigneeId: null,
        actorId: actor.id,
      })
    );

    return { task };
  },
};

const listTasks: McpTool = {
  name: "list_tasks",
  description:
    "List tasks, newest first, optionally filtered by status, priority, " +
    "assignee, project or phase.",
  inputSchema: object({
    status: enumOf(STATUSES, "Only tasks with this status"),
    priority: enumOf(PRIORITIES, "Only tasks with this priority"),
    assignee_email: str("Only tasks assigned to this member"),
    mine: { type: "boolean", description: "Only tasks assigned to you" },
    project: str("Only tasks in this project, by name"),
    phase: str(
      "Only tasks in this phase of the project, by name. Requires project. " +
        "Pass an empty string for the project's tasks that are in no phase."
    ),
    unfiled: {
      type: "boolean",
      description: "Only tasks that are in no project at all",
    },
    limit: {
      type: "number",
      description: "How many to return (1-100, default 20)",
    },
  }),
  schema: z.object({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assignee_email: z.string().optional(),
    mine: z.boolean().optional(),
    project: z.string().optional(),
    phase: z.string().optional(),
    unfiled: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  async run(args, actor) {
    const input = args as {
      status?: (typeof STATUSES)[number];
      priority?: (typeof PRIORITIES)[number];
      assignee_email?: string;
      mine?: boolean;
      project?: string;
      phase?: string;
      unfiled?: boolean;
      limit?: number;
    };

    if (input.unfiled && input.project) {
      throw new McpToolError(
        "Pass either project or unfiled, not both — unfiled means no project"
      );
    }

    const assigneeId = input.mine
      ? actor.id
      : await resolveAssignee(input.assignee_email);
    const projectId = await resolveProject(actor, input.project);
    // "" is how a text-only protocol says "no phase".
    let phaseId: string | null | undefined;
    if (input.phase !== undefined) {
      if (projectId === null) {
        throw new McpToolError("A phase only exists inside a project — pass project too");
      }
      phaseId = input.phase ? await resolvePhase(projectId, input.phase) : null;
    }

    const tasks = await prisma.task.findMany({
      where: {
        // Subtasks are reached through get_task on their parent, not listed
        // here — same as the board, list and calendar.
        parentId: null,
        ...(input.status && { status: input.status }),
        ...(input.priority && { priority: input.priority }),
        ...(assigneeId && { assigneeId }),
        ...(projectId && { projectId }),
        ...(input.unfiled && { projectId: null }),
        ...(phaseId !== undefined && { phaseId }),
        // A project named here that this member can't see just yields no
        // rows, same as any other filter that happens to match nothing.
        ...accessibleTasksFilter(actor),
      },
      select: TASK_SUMMARY,
      relationLoadStrategy: "join",
      orderBy: { createdAt: "desc" },
      take: input.limit ?? (phaseId !== undefined ? 100 : 20),
    });

    return { count: tasks.length, tasks };
  },
};

const getTask: McpTool = {
  name: "get_task",
  description:
    "Everything about one task, including its comments and attachments.",
  inputSchema: object({ task_id: str("Task id") }, ["task_id"]),
  schema: z.object({ task_id: z.uuid() }),
  async run(args, actor) {
    const { task_id } = args as { task_id: string };

    const task = await prisma.task.findUnique({
      where: { id: task_id },
      relationLoadStrategy: "join",
      select: {
        ...TASK_SUMMARY,
        description: true,
        createdBy: { select: { email: true, name: true } },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        attachments: {
          select: { id: true, filename: true, url: true, mimeType: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!task) notFound(task_id);
    await requireProjectAccess(actor, task!.projectId, "VIEWER", task_id);

    // Agents read text, not markup. Both columns are stored as rich HTML, so
    // they are flattened on the way out rather than shipping tags into a
    // context window.
    const { comments, description, ...rest } = task!;
    return {
      task: {
        ...rest,
        description: description ? toPlainText(String(description)) : null,
        comments: comments.map((comment) => ({
          ...comment,
          content: toPlainText(String(comment.content)),
        })),
      },
    };
  },
};

const updateTask: McpTool = {
  name: "update_task",
  description:
    "Change a task's title, description, status, priority, due date, " +
    "assignee, project or phase. Only the fields you pass are touched. " +
    "Moving a task to another project drops its phase unless you pass one.",
  inputSchema: object(
    {
      task_id: str("Task id"),
      title: str("New title"),
      description: str("New description. Markdown is supported."),
      status: enumOf(STATUSES, "New status"),
      priority: enumOf(PRIORITIES, "New priority"),
      start_date: str("New start date as YYYY-MM-DD, or empty string to clear it"),
      due_date: str("New due date as YYYY-MM-DD, or empty string to clear it"),
      assignee_email: str("Member to reassign it to, or empty string to unassign"),
      project: str("Project name to move it to, or empty string to unfile it"),
      phase: str(
        "Phase name to file it under (within its project, or the new one if " +
          "project is also passed), or empty string to unphase it"
      ),
    },
    ["task_id"]
  ),
  schema: z.object({
    task_id: z.uuid(),
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().max(100_000).optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    start_date: z.string().optional(),
    due_date: z.string().optional(),
    assignee_email: z.string().optional(),
    project: z.string().optional(),
    phase: z.string().optional(),
  }),
  async run(args, actor) {
    const input = args as {
      task_id: string;
      title?: string;
      description?: string;
      status?: (typeof STATUSES)[number];
      priority?: (typeof PRIORITIES)[number];
      start_date?: string;
      due_date?: string;
      assignee_email?: string;
      project?: string;
      phase?: string;
    };

    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) {
      data.description = asStoredRichText(input.description) ?? Prisma.DbNull;
    }
    if (input.status !== undefined) data.status = input.status;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.start_date !== undefined) data.startDate = parseDate(input.start_date);
    if (input.due_date !== undefined) data.dueDate = parseDate(input.due_date);

    // An empty string is how a text-only protocol says "clear this".
    let nextAssigneeId: string | null | undefined;
    if (input.assignee_email !== undefined) {
      nextAssigneeId = input.assignee_email
        ? await resolveAssignee(input.assignee_email)
        : null;
      data.assigneeId = nextAssigneeId;
    }

    // Same convention: "" unfiles the task rather than meaning "leave it alone".
    let nextProjectId: string | null | undefined;
    if (input.project !== undefined) {
      nextProjectId = input.project
        ? await resolveProject(actor, input.project, { forFiling: true })
        : null;
      data.projectId = nextProjectId;
    }

    if (Object.keys(data).length === 0 && input.phase === undefined) {
      throw new McpToolError("Nothing to update — pass at least one field");
    }

    // Read only the columns about to be written, so the diff the notification
    // describes is exactly the change that was asked for. `projectId` is
    // always read too — every update needs it to check access to the task as
    // it stands today, whether or not this call is the one moving it.
    const beforeSelect: Prisma.TaskSelect = { projectId: true };
    if (nextAssigneeId !== undefined) beforeSelect.assigneeId = true;
    if (input.title !== undefined) beforeSelect.title = true;
    if (input.status !== undefined) beforeSelect.status = true;
    if (input.priority !== undefined) beforeSelect.priority = true;
    if (input.start_date !== undefined) beforeSelect.startDate = true;
    if (input.due_date !== undefined) beforeSelect.dueDate = true;

    const before = ((await prisma.task.findUnique({
      where: { id: input.task_id },
      select: beforeSelect,
    })) ?? null) as (TaskSnapshot & { assigneeId?: string | null; projectId: string | null }) | null;
    if (!before) notFound(input.task_id);

    await requireProjectAccess(actor, before!.projectId, "EDITOR", input.task_id);
    // Moving a task into a project is filing new work there, same as creating
    // it there directly — the destination needs EDITOR too, not just the
    // project the task is leaving.
    if (nextProjectId !== undefined) {
      await requireProjectAccess(actor, nextProjectId, "EDITOR");
    }

    // A phase lives inside one project: resolve it against wherever the task
    // ends up, and drop the old one when the task changes project without
    // naming a new phase.
    const targetProjectId =
      nextProjectId !== undefined ? nextProjectId : before!.projectId;
    if (input.phase !== undefined) {
      data.phaseId = input.phase ? await resolvePhase(targetProjectId, input.phase) : null;
    } else if (nextProjectId !== undefined && nextProjectId !== before!.projectId) {
      data.phaseId = null;
    }

    let task;
    try {
      task = await prisma.task.update({
        where: { id: input.task_id },
        data,
        select: TASK_SUMMARY,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        notFound(input.task_id);
      }
      throw error;
    }

    if (nextAssigneeId !== undefined) {
      after(() =>
        notifyTaskAssigned({
          taskId: input.task_id,
          assigneeId: nextAssigneeId!,
          previousAssigneeId: before!.assigneeId ?? null,
          actorId: actor.id,
        })
      );
    }

    const changes = summarizeTaskChanges(before!, {
      title: input.title,
      status: input.status,
      priority: input.priority,
      ...(input.start_date !== undefined && { startDate: parseDate(input.start_date) }),
      ...(input.due_date !== undefined && { dueDate: parseDate(input.due_date) }),
    });
    if (changes.length > 0) {
      after(() =>
        notifyTaskUpdated({ taskId: input.task_id, changes, actorId: actor.id })
      );
    }

    return { task };
  },
};

const deleteTask: McpTool = {
  name: "delete_task",
  description: "Delete a task, along with its comments and attachments.",
  inputSchema: object({ task_id: str("Task id") }, ["task_id"]),
  schema: z.object({ task_id: z.uuid() }),
  async run(args, actor) {
    const { task_id } = args as { task_id: string };

    const before = await prisma.task.findUnique({
      where: { id: task_id },
      select: { projectId: true },
    });
    if (!before) notFound(task_id);
    await requireProjectAccess(actor, before!.projectId, "EDITOR", task_id);

    try {
      await prisma.task.delete({ where: { id: task_id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        notFound(task_id);
      }
      throw error;
    }
    return { deleted: task_id };
  },
};

const addComment: McpTool = {
  name: "add_comment",
  description: "Comment on a task, as you.",
  inputSchema: object(
    {
      task_id: str("Task id"),
      content: str("Comment body. Markdown is supported."),
    },
    ["task_id", "content"]
  ),
  schema: z.object({
    task_id: z.uuid(),
    content: z.string().trim().min(1).max(100_000),
  }),
  async run(args, actor) {
    const input = args as { task_id: string; content: string };

    const content = asStoredRichText(input.content);
    if (!content) throw new McpToolError("Comment cannot be empty");

    const task = await prisma.task.findUnique({
      where: { id: input.task_id },
      select: { id: true, projectId: true },
    });
    if (!task) notFound(input.task_id);
    await requireProjectAccess(actor, task!.projectId, "VIEWER", input.task_id);

    const comment = await prisma.comment.create({
      data: { content, taskId: input.task_id, authorId: actor.id },
      select: { id: true, createdAt: true },
    });

    after(() =>
      notifyCommentAdded({
        taskId: input.task_id,
        commentId: comment.id,
        commentHtml: content,
        actorId: actor.id,
      })
    );

    return { comment: { ...comment, taskId: input.task_id } };
  },
};

const listMembers: McpTool = {
  name: "list_members",
  description:
    "Approved members, for assigning work. Emails from here are what " +
    "assignee_email expects.",
  inputSchema: object({}),
  schema: z.object({}),
  async run() {
    const members = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { email: true, name: true, role: true },
      orderBy: { email: "asc" },
    });
    return { count: members.length, members };
  },
};

const moveTask: McpTool = {
  name: "move_task",
  description: "Shorthand for changing only a task's status.",
  inputSchema: object(
    { task_id: str("Task id"), status: enumOf(STATUSES, "Status to move it to") },
    ["task_id", "status"]
  ),
  schema: z.object({ task_id: z.uuid(), status: z.enum(STATUSES) }),
  async run(args, actor) {
    const input = args as { task_id: string; status: (typeof STATUSES)[number] };

    const before = await prisma.task.findUnique({
      where: { id: input.task_id },
      select: { status: true, projectId: true },
    });
    if (!before) notFound(input.task_id);
    await requireProjectAccess(actor, before!.projectId, "EDITOR", input.task_id);

    const task = await prisma.task.update({
      where: { id: input.task_id },
      data: { status: input.status },
      select: TASK_SUMMARY,
    });

    if (before!.status !== input.status) {
      after(() =>
        notifyTaskUpdated({
          taskId: input.task_id,
          changes: describeTaskValues({ status: input.status }),
          actorId: actor.id,
        })
      );
    }

    return { task };
  },
};

const listProjects: McpTool = {
  name: "list_projects",
  description:
    "Projects, with how many tasks are filed in each. Names from here are " +
    "what the `project` argument on the task tools expects.",
  inputSchema: object({
    include_archived: {
      type: "boolean",
      description: "Include retired projects. Defaults to false.",
    },
  }),
  schema: z.object({ include_archived: z.boolean().optional() }),
  async run(args, actor) {
    const input = args as { include_archived?: boolean };

    const projects = await prisma.project.findMany({
      where: {
        ...(input.include_archived ? {} : { archived: false }),
        ...accessibleProjectsFilter(actor),
      },
      select: {
        name: true,
        description: true,
        color: true,
        archived: true,
        _count: { select: { tasks: true } },
      },
      relationLoadStrategy: "join",
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    });

    return {
      count: projects.length,
      projects: projects.map(({ _count, ...rest }) => ({
        ...rest,
        taskCount: _count.tasks,
      })),
    };
  },
};

const createProject: McpTool = {
  name: "create_project",
  description:
    "Create a project to group tasks under. Names are unique, ignoring case.",
  inputSchema: object(
    {
      name: str("Project name"),
      description: str("What the project is for"),
      color: enumOf(PROJECT_COLORS, "Colour for the project's chip"),
    },
    ["name"]
  ),
  schema: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    color: z.enum(PROJECT_COLORS).optional(),
  }),
  async run(args, actor) {
    const input = args as {
      name: string;
      description?: string;
      color?: ProjectColor;
    };

    try {
      const project = await prisma.project.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? null,
          createdById: actor.id,
          // The creator needs to be able to use what they just made — same
          // as the REST route, they start as its EDITOR.
          members: { create: { userId: actor.id, role: "EDITOR" } },
        },
        select: {
          id: true,
          name: true,
          description: true,
          color: true,
          archived: true,
        },
      });
      return { project };
    } catch (error) {
      // The case-insensitive unique index only reports at write time, so a
      // duplicate arrives here rather than from a pre-read.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new McpToolError(
          `A project called "${input.name}" already exists`
        );
      }
      throw error;
    }
  },
};

/**
 * Every phase tool starts the same way: resolve the project by name, check the
 * caller's role on it, and hand back its id.
 */
async function projectFor(
  actor: AppUser,
  name: string,
  minRole: "VIEWER" | "EDITOR"
): Promise<string> {
  const projectId = (await resolveProject(actor, name, { forFiling: minRole === "EDITOR" }))!;
  await requireProjectAccess(actor, projectId, minRole);
  return projectId;
}

const duplicatePhase = (error: unknown, name: string) => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new McpToolError(`That project already has a phase called "${name}"`);
  }
  throw error;
};

const PHASE_FIELDS = {
  name: true,
  description: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.PhaseSelect;

const listPhases: McpTool = {
  name: "list_phases",
  description:
    "A project's phases (stages) in order, with how many tasks are in each " +
    "and how many are done. Names from here are what the `phase` argument " +
    "on the task tools expects.",
  inputSchema: object({ project: str("Project name") }, ["project"]),
  schema: z.object({ project: z.string().trim().min(1) }),
  async run(args, actor) {
    const { project } = args as { project: string };
    const projectId = await projectFor(actor, project, "VIEWER");

    const [phases, all, done, unphased] = await Promise.all([
      prisma.phase.findMany({
        where: { projectId },
        select: { id: true, ...PHASE_FIELDS },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      prisma.task.groupBy({
        by: ["phaseId"],
        where: { projectId, parentId: null },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["phaseId"],
        where: { projectId, parentId: null, status: "DONE" },
        _count: { _all: true },
      }),
      prisma.task.count({ where: { projectId, parentId: null, phaseId: null } }),
    ]);

    const tally = (rows: typeof all, id: string) =>
      rows.find((row) => row.phaseId === id)?._count._all ?? 0;

    return {
      count: phases.length,
      phases: phases.map(({ id, ...phase }) => ({
        ...phase,
        taskCount: tally(all, id),
        doneCount: tally(done, id),
      })),
      unphasedTaskCount: unphased,
    };
  },
};

const createPhase: McpTool = {
  name: "create_phase",
  description:
    "Add a phase (stage) to a project, after its existing ones. Names are " +
    "unique within a project, ignoring case.",
  inputSchema: object(
    {
      project: str("Project name"),
      name: str("Phase name, e.g. \"Phase 1: Onboarding agent\""),
      description: str("What this phase covers"),
      start_date: str("Planned start as YYYY-MM-DD"),
      end_date: str("Planned end as YYYY-MM-DD"),
    },
    ["project", "name"]
  ),
  schema: z.object({
    project: z.string().trim().min(1),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  }),
  async run(args, actor) {
    const input = args as {
      project: string;
      name: string;
      description?: string;
      start_date?: string;
      end_date?: string;
    };
    const projectId = await projectFor(actor, input.project, "EDITOR");

    const last = await prisma.phase.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    try {
      const phase = await prisma.phase.create({
        data: {
          projectId,
          name: input.name,
          description: input.description || null,
          startDate: parseDate(input.start_date),
          endDate: parseDate(input.end_date),
          order: (last?.order ?? 0) + 1000,
        },
        select: PHASE_FIELDS,
      });
      return { phase };
    } catch (error) {
      return duplicatePhase(error, input.name);
    }
  },
};

const updatePhase: McpTool = {
  name: "update_phase",
  description:
    "Rename a phase, change its description or dates, or move it to another " +
    "position. Only the fields you pass are touched.",
  inputSchema: object(
    {
      project: str("Project name"),
      phase: str("Current phase name"),
      new_name: str("New name"),
      description: str("New description, or empty string to clear it"),
      start_date: str("New planned start as YYYY-MM-DD, or empty string to clear it"),
      end_date: str("New planned end as YYYY-MM-DD, or empty string to clear it"),
      position: {
        type: "number",
        description: "New 1-based position among the project's phases",
      },
    },
    ["project", "phase"]
  ),
  schema: z.object({
    project: z.string().trim().min(1),
    phase: z.string().trim().min(1),
    new_name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    position: z.number().int().min(1).optional(),
  }),
  async run(args, actor) {
    const input = args as {
      project: string;
      phase: string;
      new_name?: string;
      description?: string;
      start_date?: string;
      end_date?: string;
      position?: number;
    };
    const projectId = await projectFor(actor, input.project, "EDITOR");
    const phaseId = await resolvePhase(projectId, input.phase);

    const data: Prisma.PhaseUncheckedUpdateInput = {};
    if (input.new_name !== undefined) data.name = input.new_name;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.start_date !== undefined) data.startDate = parseDate(input.start_date);
    if (input.end_date !== undefined) data.endDate = parseDate(input.end_date);

    if (input.position !== undefined) {
      // Slot between the neighbours at the requested position, the same
      // fractional trick the board uses for task order.
      const others = await prisma.phase.findMany({
        where: { projectId, id: { not: phaseId } },
        select: { order: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });
      const index = Math.min(input.position - 1, others.length);
      const prev = others[index - 1]?.order;
      const next = others[index]?.order;
      data.order =
        prev === undefined && next === undefined
          ? 1000
          : prev === undefined
            ? next! - 1000
            : next === undefined
              ? prev + 1000
              : (prev + next) / 2;
    }

    if (Object.keys(data).length === 0) {
      throw new McpToolError("Nothing to update — pass at least one field");
    }

    try {
      const phase = await prisma.phase.update({
        where: { id: phaseId },
        data,
        select: PHASE_FIELDS,
      });
      return { phase };
    } catch (error) {
      return duplicatePhase(error, input.new_name ?? input.phase);
    }
  },
};

const deletePhase: McpTool = {
  name: "delete_phase",
  description:
    "Remove a phase from a project. Its tasks are NOT deleted — they stay in " +
    "the project with no phase.",
  inputSchema: object(
    { project: str("Project name"), phase: str("Phase name") },
    ["project", "phase"]
  ),
  schema: z.object({
    project: z.string().trim().min(1),
    phase: z.string().trim().min(1),
  }),
  async run(args, actor) {
    const input = args as { project: string; phase: string };
    const projectId = await projectFor(actor, input.project, "EDITOR");
    const phaseId = await resolvePhase(projectId, input.phase);

    const unphased = await prisma.task.count({ where: { phaseId } });
    await prisma.phase.delete({ where: { id: phaseId } });
    return { deleted: input.phase, tasksUnphased: unphased };
  },
};

export const TOOLS: McpTool[] = [
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  addComment,
  listMembers,
  listProjects,
  createProject,
  listPhases,
  createPhase,
  updatePhase,
  deletePhase,
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

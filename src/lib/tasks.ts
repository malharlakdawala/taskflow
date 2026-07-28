import type { Prisma } from "@/generated/prisma/client";
import { sanitizeRichText } from "@/lib/sanitize";
import { toRichHtml } from "@/lib/rich-text";

/** Only the user fields the UI renders — never leak approval state into task payloads. */
const USER_SUMMARY = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/**
 * Board / list / calendar shape. Deliberately excludes comments and
 * attachments: those views never render them, and loading every comment for
 * every task was the single biggest contributor to slow page loads.
 * `_count` gives the UI its badge numbers for one extra aggregate.
 */
export const TASK_LIST_SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  order: true,
  assigneeId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: USER_SUMMARY },
  createdBy: { select: USER_SUMMARY },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TaskSelect;

/** Full shape for the single-task detail page. */
export const TASK_DETAIL_INCLUDE = {
  assignee: { select: USER_SUMMARY },
  createdBy: { select: USER_SUMMARY },
  comments: {
    include: { author: { select: USER_SUMMARY } },
    orderBy: { createdAt: "desc" },
  },
  attachments: { orderBy: { createdAt: "asc" } },
  tags: { include: { tag: true } },
} satisfies Prisma.TaskInclude;

type TaskListRow = Prisma.TaskGetPayload<{ select: typeof TASK_LIST_SELECT }>;
type TaskDetailRow = Prisma.TaskGetPayload<{ include: typeof TASK_DETAIL_INCLUDE }>;

/**
 * `description` and `comment.content` are jsonb columns holding Tiptap HTML.
 * Prisma types them as JsonValue, so normalise to the string|null the UI wants.
 *
 * The MCP server writes these columns directly, and a terminal or import script
 * supplies Markdown rather than HTML. `toRichHtml` gives that content its
 * structure back; rows that already hold HTML pass through untouched, so
 * round-tripping through the editor loses nothing.
 */
function asRichText(value: Prisma.JsonValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return toRichHtml(raw);
}

/**
 * Content is already sanitised on write, but rows created before that existed
 * were not — and the UI renders this through dangerouslySetInnerHTML. Cleaning
 * on the way out too means no stored row can ever inject script.
 */
function asSafeRichText(value: Prisma.JsonValue | null | undefined): string | null {
  const raw = asRichText(value);
  return raw === null ? null : sanitizeRichText(raw);
}

/** List rows carry counts instead of the full comment/attachment arrays. */
export function serializeTaskRow(task: TaskListRow) {
  const { _count, ...rest } = task;
  return {
    ...rest,
    description: asRichText(task.description),
    commentCount: _count.comments,
    attachmentCount: _count.attachments,
    comments: [],
    attachments: [],
    tags: [],
  };
}

export function serializeTask(task: TaskDetailRow) {
  return {
    ...task,
    description: asSafeRichText(task.description),
    commentCount: task.comments.length,
    attachmentCount: task.attachments.length,
    comments: task.comments.map((comment) => ({
      ...comment,
      content: asSafeRichText(comment.content) ?? "",
    })),
  };
}

export function serializeComment<T extends { content: Prisma.JsonValue }>(
  comment: T
) {
  return { ...comment, content: asSafeRichText(comment.content) ?? "" };
}

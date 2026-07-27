import type { Prisma } from "@/generated/prisma/client";

/** Everything the task UI needs, in one shape, used by every task endpoint. */
export const TASK_INCLUDE = {
  assignee: true,
  createdBy: true,
  comments: {
    include: { author: true },
    orderBy: { createdAt: "desc" },
  },
  attachments: { orderBy: { createdAt: "asc" } },
  tags: { include: { tag: true } },
} satisfies Prisma.TaskInclude;

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

/**
 * `description` and `comment.content` are jsonb columns holding Tiptap HTML.
 * Prisma types them as JsonValue, so normalise to the string|null the UI expects.
 */
function asRichText(value: Prisma.JsonValue | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function serializeTask(task: TaskWithRelations) {
  return {
    ...task,
    description: asRichText(task.description),
    comments: task.comments.map((comment) => ({
      ...comment,
      content: asRichText(comment.content) ?? "",
    })),
  };
}

export function serializeComment<T extends { content: Prisma.JsonValue }>(
  comment: T
) {
  return { ...comment, content: asRichText(comment.content) ?? "" };
}

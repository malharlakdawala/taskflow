import { z } from "zod";
import { PROJECT_COLORS } from "@/lib/types";

export const TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
] as const;

export const TASK_PRIORITIES = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
] as const;

const statusSchema = z.enum(TASK_STATUSES);
const prioritySchema = z.enum(TASK_PRIORITIES);

/** Tiptap serialises to an HTML string; empty strings are stored as null. */
const richTextSchema = z.string().max(100_000);

const dueDateSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"))
  .nullable();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: richTextSchema.nullish(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  dueDate: dueDateSchema.optional(),
  assigneeId: z.uuid().nullish(),
  /** Null files the task nowhere, which is the default. */
  projectId: z.uuid().nullish(),
});

/**
 * Explicit allow-list. The previous implementation spread the raw request body
 * straight into prisma.update(), which let a caller write any column.
 */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: richTextSchema.nullable(),
    status: statusSchema,
    priority: prioritySchema,
    dueDate: dueDateSchema,
    assigneeId: z.uuid().nullable(),
    projectId: z.uuid().nullable(),
    order: z.number().finite(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export const reorderTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        id: z.uuid(),
        status: statusSchema,
        order: z.number().finite(),
      })
    )
    .min(1)
    .max(500),
});

/** Bulk edit from the list view. At least one field must actually change. */
export const bulkUpdateSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    status: statusSchema.optional(),
    priority: prioritySchema.optional(),
    assigneeId: z.uuid().nullable().optional(),
    dueDate: dueDateSchema.optional(),
    projectId: z.uuid().nullable().optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.priority !== undefined ||
      data.assigneeId !== undefined ||
      data.dueDate !== undefined ||
      data.projectId !== undefined,
    { message: "No fields to update" }
  );

export const bulkDeleteSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
});

/**
 * `color` is an enum rather than a string because the value ends up in a
 * `data-project-color` attribute that CSS matches on. Names are trimmed and
 * capped; case-insensitive uniqueness is enforced by the database index.
 */
export const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(2000).nullish(),
  color: z.enum(PROJECT_COLORS).nullish(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    description: z.string().trim().max(2000).nullable(),
    color: z.enum(PROJECT_COLORS).nullable(),
    archived: z.boolean(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export const updateMemberSchema = z
  .object({
    role: z.enum(["ADMIN", "MEMBER"]).optional(),
    status: z.enum(["PENDING", "ACTIVE", "REJECTED"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(100_000),
});

/**
 * Marking notifications read, or clearing them. `all` is the "mark everything"
 * button; `ids` is what the feed sends when you open one. Requiring one or the
 * other stops an empty body from silently wiping the whole feed.
 */
export const notificationMutationSchema = z
  .object({
    ids: z.array(z.uuid()).min(1).max(200).optional(),
    all: z.literal(true).optional(),
  })
  .refine((data) => data.all === true || (data.ids?.length ?? 0) > 0, {
    message: "Provide ids or all",
  });

export const createAttachmentSchema = z.object({
  filename: z.string().min(1).max(500),
  url: z.url(),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(255),
});

/** Turns a Zod failure into a 400-shaped payload. */
export function formatZodError(error: z.ZodError) {
  return {
    error: "Invalid request",
    details: z.flattenError(error).fieldErrors,
  };
}

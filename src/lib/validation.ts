import { z } from "zod";

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

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty").max(100_000),
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

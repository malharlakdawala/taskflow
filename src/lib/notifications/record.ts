import "server-only";

import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@/generated/prisma/enums";
import { toPlainText } from "@/lib/utils";

/**
 * Writing the in-app feed.
 *
 * Rows are fanned out on write — one per recipient — so reading a feed is a
 * single indexed scan with no joins and no per-request recomputation.
 *
 * Everything here is best-effort in exactly the way email is: these run inside
 * `after()`, and a failed insert must never turn a successful task update into
 * a 500. A notification nobody sees is a smaller problem than a write the user
 * is told failed when it didn't.
 */

export interface NotificationDraft {
  /** Who sees it. */
  userId: string;
  /** Who caused it. Omit for system events like the due-date digest. */
  actorId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** In-app path, e.g. `/tasks/<id>`. Resolved at write time. */
  url: string;
  taskId?: string | null;
  commentId?: string | null;
}

export async function recordNotifications(
  drafts: NotificationDraft[]
): Promise<void> {
  if (drafts.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: drafts.map((draft) => ({
        userId: draft.userId,
        actorId: draft.actorId ?? null,
        type: draft.type,
        title: draft.title,
        body: draft.body ?? null,
        url: draft.url,
        taskId: draft.taskId ?? null,
        commentId: draft.commentId ?? null,
      })),
    });
  } catch (error) {
    console.error("[notifications] could not record:", error);
  }
}

/** Deep link to a task, and to a specific comment within its thread. */
export const taskPath = (taskId: string) => `/tasks/${taskId}`;
export const commentPath = (taskId: string, commentId: string) =>
  `/tasks/${taskId}#comment-${commentId}`;

/**
 * Keeps one notification to one or two lines in a 22rem-wide panel. Titles are
 * clamped by CSS as well, but a 500-character task title embedded in a sentence
 * would push the rest of it out of view entirely.
 */
export function clip(value: string, max = 70): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

/** Task titles appear inside a sentence, so they are quoted to stay legible. */
export const quoted = (title: string) => `“${clip(title)}”`;

/** First line or so of a rich-text comment, as plain text. */
export const excerpt = (html: string, max = 140) => clip(toPlainText(html), max);

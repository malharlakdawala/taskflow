import "server-only";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const invalidParent = (message: string) =>
  NextResponse.json({ error: message }, { status: 400 });

export type ParentCheck =
  | { ok: true; parentProjectId: string | null }
  | { ok: false; response: NextResponse };

/**
 * A subtask may only be filed under a top-level task, and a task that already
 * has subtasks may not become one — both would make the hierarchy more than
 * one level deep, which nothing in the UI or the cascade-delete migration
 * expects.
 *
 * On success, also hands back the parent's `projectId` — a subtask is filed
 * wherever its parent is, never separately, so a subtask of a restricted
 * project's task can't be created (or reparented) as unfiled and read around
 * that project's membership.
 *
 * `taskId` is omitted when creating a new task — it has no id yet, and so
 * cannot already have subtasks of its own.
 */
export async function checkParent(
  parentId: string,
  taskId?: string
): Promise<ParentCheck> {
  if (parentId === taskId) {
    return { ok: false, response: invalidParent("A task cannot be its own subtask") };
  }

  const parent = await prisma.task.findUnique({
    where: { id: parentId },
    select: { parentId: true, projectId: true },
  });
  if (!parent) return { ok: false, response: invalidParent("Parent task not found") };
  if (parent.parentId !== null) {
    return {
      ok: false,
      response: invalidParent("Cannot file a subtask under another subtask"),
    };
  }

  if (taskId) {
    const ownSubtasks = await prisma.task.count({ where: { parentId: taskId } });
    if (ownSubtasks > 0) {
      return {
        ok: false,
        response: invalidParent("This task has its own subtasks and can't become one"),
      };
    }
  }

  return { ok: true, parentProjectId: parent.projectId };
}

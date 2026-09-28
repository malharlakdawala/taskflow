import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { getProjectRole } from "@/lib/project-access";
import { reorderTasksSchema, formatZodError } from "@/lib/validation";
import { notifyTaskUpdated, describeTaskValues } from "@/lib/notifications/dispatch";

/**
 * Persists a drag-and-drop rearrangement. The board sends every task whose
 * column or position changed; the writes run in one transaction so the board
 * never ends up half-reordered.
 */
export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = reorderTasksSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { tasks } = parsed.data;

  // Dragging a card across columns is the main way status changes in this app,
  // so it has to raise the same notification a dropdown does. Most of the
  // payload is only reordering within a column, though, so the statuses are
  // read first and only genuine column moves are announced — one indexed
  // findMany, against a payload that already costs N updates.
  const before = await prisma.task.findMany({
    where: { id: { in: tasks.map((task) => task.id) } },
    select: { id: true, status: true, projectId: true },
  });

  // The board only ever renders tasks this member can already edit, so this
  // only fires against a stale or tampered payload — checked all-or-nothing
  // rather than silently reordering the subset that is allowed.
  if (guard.user.role !== "ADMIN") {
    const distinctProjects = [
      ...new Set(before.map((task) => task.projectId)),
    ].filter((id): id is string => id !== null);
    for (const projectId of distinctProjects) {
      const role = await getProjectRole(guard.user.id, projectId);
      if (role !== "EDITOR") {
        return NextResponse.json(
          { error: "You don't have edit access to one or more of these tasks" },
          { status: 403 }
        );
      }
    }
  }

  const previousStatus = new Map(before.map((task) => [task.id, task.status]));
  const moved = tasks.filter(
    (task) => previousStatus.get(task.id) !== task.status
  );

  await prisma.$transaction(
    tasks.map(({ id, status, order }) =>
      prisma.task.update({ where: { id }, data: { status, order } })
    )
  );

  if (moved.length > 0) {
    after(async () => {
      for (const task of moved) {
        await notifyTaskUpdated({
          taskId: task.id,
          changes: describeTaskValues({ status: task.status }),
          actorId: guard.user.id,
        });
      }
    });
  }

  return NextResponse.json({ success: true, updated: tasks.length });
}

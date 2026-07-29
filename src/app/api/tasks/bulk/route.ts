import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { bulkUpdateSchema, bulkDeleteSchema, formatZodError } from "@/lib/validation";
import {
  describeTaskValues,
  notifyTasksAssigned,
  notifyTasksUpdated,
  summarizeTaskChanges,
  type TaskSnapshot,
} from "@/lib/notifications/dispatch";

/**
 * Applies one change to many tasks in a single request. The list view's bulk
 * bar would otherwise fire N requests, each paying the full round-trip to a
 * distant database.
 */
export async function PATCH(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = bulkUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { ids, status, priority, assigneeId, dueDate } = parsed.data;

  const data: Prisma.TaskUncheckedUpdateManyInput = {};
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (assigneeId !== undefined) data.assigneeId = assigneeId;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

  // What the rows looked like before, read once and reused for both the
  // "who is this newly on?" question and the change summary. Only the columns
  // this request writes are read, so the pre-read stays proportional.
  const beforeSelect: Prisma.TaskSelect = { id: true };
  if (assigneeId !== undefined) beforeSelect.assigneeId = true;
  if (status !== undefined) beforeSelect.status = true;
  if (priority !== undefined) beforeSelect.priority = true;
  if (dueDate !== undefined) beforeSelect.dueDate = true;

  const before = (await prisma.task.findMany({
    where: { id: { in: ids } },
    select: beforeSelect,
  })) as Array<TaskSnapshot & { id: string; assigneeId?: string | null }>;

  // Which rows are genuinely changing hands. Comparing in JS rather than with
  // a `not` filter because SQL's NULL <> x is NULL, so an unassigned task
  // would be missed by the query.
  // Held in its own const so the narrowing survives into the after() closure.
  const nextAssigneeId = assigneeId ?? null;
  const newlyAssigned =
    nextAssigneeId === null
      ? []
      : before
          .filter((task) => task.assigneeId !== nextAssigneeId)
          .map((task) => task.id);

  const result = await prisma.task.updateMany({
    where: { id: { in: ids } },
    data,
  });

  // Every selected row ends up with the same values, so one summary describes
  // the whole operation. The per-row diff is only used to drop tasks that were
  // already in that state — reselecting fifty Done tasks and setting them Done
  // should notify nobody.
  const nextValues: TaskSnapshot = {
    ...(status !== undefined && { status }),
    ...(priority !== undefined && { priority }),
    ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
  };
  const changedIds = before
    .filter((task) => summarizeTaskChanges(task, nextValues).length > 0)
    .map((task) => task.id);
  const changes = describeTaskValues(nextValues);

  if (newlyAssigned.length > 0) {
    // One digest, not one email per task — a fifty-task reassignment should
    // not fill someone's inbox.
    after(() =>
      notifyTasksAssigned({
        taskIds: newlyAssigned,
        assigneeId: nextAssigneeId,
        actorId: guard.user.id,
      })
    );
  }

  if (changedIds.length > 0) {
    after(() =>
      notifyTasksUpdated({
        taskIds: changedIds,
        changes,
        actorId: guard.user.id,
      })
    );
  }

  return NextResponse.json({ success: true, updated: result.count });
}

export async function DELETE(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = bulkDeleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const result = await prisma.task.deleteMany({
    where: { id: { in: parsed.data.ids } },
  });

  return NextResponse.json({ success: true, deleted: result.count });
}

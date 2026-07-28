import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { bulkUpdateSchema, bulkDeleteSchema, formatZodError } from "@/lib/validation";
import { notifyTasksAssigned } from "@/lib/email/notify";

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

  // Which rows are genuinely changing hands has to be read before the write.
  // Comparing in JS rather than with a `not` filter because SQL's NULL <> x is
  // NULL, so an unassigned task would be missed by the query.
  // Held in its own const so the narrowing survives into the after() closure.
  const nextAssigneeId = assigneeId ?? null;
  let newlyAssigned: string[] = [];
  if (nextAssigneeId !== null) {
    const before = await prisma.task.findMany({
      where: { id: { in: ids } },
      select: { id: true, assigneeId: true },
    });
    newlyAssigned = before
      .filter((task) => task.assigneeId !== nextAssigneeId)
      .map((task) => task.id);
  }

  const result = await prisma.task.updateMany({
    where: { id: { in: ids } },
    data,
  });

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

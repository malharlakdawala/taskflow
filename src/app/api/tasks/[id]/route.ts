import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { sanitizeOrNull } from "@/lib/sanitize";
import { updateTaskSchema, formatZodError } from "@/lib/validation";
import { TASK_DETAIL_INCLUDE, serializeTask } from "@/lib/tasks";
import { notifyTaskAssigned } from "@/lib/email/notify";

const notFound = () =>
  NextResponse.json({ error: "Task not found" }, { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    relationLoadStrategy: "join",
    include: TASK_DETAIL_INCLUDE,
  });

  if (!task) return notFound();

  return NextResponse.json(serializeTask(task));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parsed = updateTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { title, description, status, priority, dueDate, assigneeId, order } =
    parsed.data;

  // Fields are applied individually so only allow-listed columns can change.
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) {
    // Clearing a nullable Json column needs Prisma.DbNull, not a bare null.
    data.description = sanitizeOrNull(description) ?? Prisma.DbNull;
  }
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined) data.assigneeId = assigneeId;
  if (order !== undefined) data.order = order;

  // Only read the current assignee when the request could change it — an extra
  // round-trip on every status tweak is not worth paying for.
  let previousAssigneeId: string | null = null;
  if (assigneeId !== undefined) {
    const current = await prisma.task.findUnique({
      where: { id },
      select: { assigneeId: true },
    });
    previousAssigneeId = current?.assigneeId ?? null;
  }

  // update() throws P2025 when the row is gone, which saves a pre-read.
  try {
    const task = await prisma.task.update({
      where: { id },
      data,
      relationLoadStrategy: "join",
      include: TASK_DETAIL_INCLUDE,
    });

    if (assigneeId !== undefined) {
      // after() runs once the response is on the wire, so the picker doesn't
      // wait on an SMTP round-trip to show the new assignee.
      after(() =>
        notifyTaskAssigned({
          taskId: task.id,
          assigneeId: task.assigneeId,
          previousAssigneeId,
          actorId: guard.user.id,
        })
      );
    }

    return NextResponse.json(serializeTask(task));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    await prisma.task.delete({ where: { id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}

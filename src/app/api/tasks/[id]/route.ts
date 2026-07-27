import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { updateTaskSchema, formatZodError } from "@/lib/validation";
import { TASK_DETAIL_INCLUDE, serializeTask } from "@/lib/tasks";

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
    data.description = description?.trim() ? description : Prisma.DbNull;
  }
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined) data.assigneeId = assigneeId;
  if (order !== undefined) data.order = order;

  // update() throws P2025 when the row is gone, which saves a pre-read.
  try {
    const task = await prisma.task.update({
      where: { id },
      data,
      relationLoadStrategy: "join",
      include: TASK_DETAIL_INCLUDE,
    });
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

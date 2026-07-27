import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser, unauthorized } from "@/lib/auth";
import { updateTaskSchema, formatZodError } from "@/lib/validation";
import { TASK_INCLUDE, serializeTask } from "@/lib/tasks";

const notFound = () =>
  NextResponse.json({ error: "Task not found" }, { status: 404 });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: TASK_INCLUDE,
  });

  if (!task) return notFound();

  return NextResponse.json(serializeTask(task));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const parsed = updateTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { title, description, status, priority, dueDate, assigneeId, order } =
    parsed.data;

  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return notFound();

  // Fields are applied individually so only the allow-listed columns can change.
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

  const task = await prisma.task.update({
    where: { id },
    data,
    include: TASK_INCLUDE,
  });

  return NextResponse.json(serializeTask(task));
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return notFound();

  await prisma.task.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

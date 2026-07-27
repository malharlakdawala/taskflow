import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser, unauthorized } from "@/lib/auth";
import { createTaskSchema, formatZodError } from "@/lib/validation";
import { TASK_INCLUDE, serializeTask } from "@/lib/tasks";

export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const tasks = await prisma.task.findMany({
    include: TASK_INCLUDE,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks.map(serializeTask));
}

export async function POST(request: Request) {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const parsed = createTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { title, description, status, priority, dueDate, assigneeId } =
    parsed.data;

  // Place the new task at the bottom of its column.
  const last = await prisma.task.findFirst({
    where: { status: status ?? "TODO" },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: description?.trim() ? description : undefined,
      status: status ?? "TODO",
      priority: priority ?? "NONE",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      order: (last?.order ?? 0) + 1000,
      assigneeId: assigneeId ?? user.id,
      createdById: user.id,
    },
    include: TASK_INCLUDE,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}

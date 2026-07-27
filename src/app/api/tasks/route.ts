import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { createTaskSchema, formatZodError } from "@/lib/validation";
import {
  TASK_LIST_SELECT,
  TASK_DETAIL_INCLUDE,
  serializeTaskRow,
  serializeTask,
} from "@/lib/tasks";

export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const tasks = await prisma.task.findMany({
    // One JOIN rather than a query per relation — round-trips are the
    // dominant cost against a geographically distant database.
    relationLoadStrategy: "join",
    select: TASK_LIST_SELECT,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks.map(serializeTaskRow));
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = createTaskSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { title, description, status, priority, dueDate, assigneeId } =
    parsed.data;
  const resolvedStatus = status ?? "TODO";

  const last = await prisma.task.findFirst({
    where: { status: resolvedStatus },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const task = await prisma.task.create({
    data: {
      title,
      description: description?.trim() ? description : undefined,
      status: resolvedStatus,
      priority: priority ?? "NONE",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      order: (last?.order ?? 0) + 1000,
      assigneeId: assigneeId ?? guard.user.id,
      createdById: guard.user.id,
    },
    relationLoadStrategy: "join",
    include: TASK_DETAIL_INCLUDE,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
}

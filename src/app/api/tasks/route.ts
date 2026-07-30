import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { sanitizeOrNull } from "@/lib/sanitize";
import { createTaskSchema, formatZodError } from "@/lib/validation";
import { notifyTaskAssigned } from "@/lib/notifications/dispatch";
import {
  TASK_LIST_SELECT,
  TASK_DETAIL_INCLUDE,
  serializeTaskRow,
  serializeTask,
} from "@/lib/tasks";

const unknownProject = () =>
  NextResponse.json({ error: "Project not found" }, { status: 400 });

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

  const { title, description, status, priority, dueDate, assigneeId, projectId } =
    parsed.data;
  const resolvedStatus = status ?? "TODO";

  const last = await prisma.task.findFirst({
    where: { status: resolvedStatus },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  let task;
  try {
    task = await prisma.task.create({
      data: {
        title,
        description: sanitizeOrNull(description) ?? undefined,
        status: resolvedStatus,
        priority: priority ?? "NONE",
        dueDate: dueDate ? new Date(dueDate) : undefined,
        order: (last?.order ?? 0) + 1000,
        // Null is the default: a task filed nowhere is unfiled, not invalid.
        projectId: projectId ?? null,
        assigneeId: assigneeId ?? guard.user.id,
        createdById: guard.user.id,
      },
      relationLoadStrategy: "join",
      include: TASK_DETAIL_INCLUDE,
    });
  } catch (error) {
    // A well-formed uuid for a project that does not exist is a client mistake,
    // not a server fault — and an MCP client working from a stale list is the
    // likeliest source of one.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return unknownProject();
    }
    throw error;
  }

  // A task created straight onto someone else's plate is an assignment; one
  // that defaults to the creator is not, and notifyTaskAssigned skips it.
  after(() =>
    notifyTaskAssigned({
      taskId: task.id,
      assigneeId: task.assigneeId,
      previousAssigneeId: null,
      actorId: guard.user.id,
    })
  );

  return NextResponse.json(serializeTask(task), { status: 201 });
}

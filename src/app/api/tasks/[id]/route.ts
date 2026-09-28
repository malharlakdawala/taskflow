import { NextResponse, after } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { sanitizeOrNull } from "@/lib/sanitize";
import { updateTaskSchema, formatZodError } from "@/lib/validation";
import { checkParent } from "@/lib/tasks-parent";
import { requireTaskProjectRole } from "@/lib/project-access";
import { TASK_DETAIL_INCLUDE, serializeTask } from "@/lib/tasks";
import {
  notifyTaskAssigned,
  notifyTaskUpdated,
  summarizeTaskChanges,
  type TaskSnapshot,
} from "@/lib/notifications/dispatch";

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

  // A task in a project this member isn't on reads as gone entirely — same
  // as the pending-approval screen, confirming it exists is itself a leak.
  const rejection = await requireTaskProjectRole(guard.user, task.projectId, "VIEWER");
  if (rejection) return notFound();

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

  const {
    title,
    description,
    status,
    priority,
    startDate,
    dueDate,
    assigneeId,
    projectId,
    order,
    parentId,
  } = parsed.data;

  // Fields are applied individually so only allow-listed columns can change.
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) {
    // Clearing a nullable Json column needs Prisma.DbNull, not a bare null.
    data.description = sanitizeOrNull(description) ?? Prisma.DbNull;
  }
  if (status !== undefined) data.status = status;
  if (priority !== undefined) data.priority = priority;
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (assigneeId !== undefined) data.assigneeId = assigneeId;
  // Null unfiles the task, which is a legitimate destination rather than a
  // missing value — so this is only skipped when the key is absent entirely.
  if (projectId !== undefined) data.projectId = projectId;
  if (order !== undefined) data.order = order;
  // Same rule: null promotes a subtask back to top-level, which is only
  // skipped when the key is absent.
  if (parentId !== undefined) data.parentId = parentId;

  if (parentId) {
    const parentCheck = await checkParent(parentId, id);
    if (!parentCheck.ok) return parentCheck.response;
    // A subtask is filed wherever its parent is — never separately — so this
    // overrides any projectId sent alongside parentId.
    data.projectId = parentCheck.parentProjectId;
  }

  // Notifications need to know what the values were, and only the caller of
  // this route knows which columns are being written. So the pre-read is built
  // from the request: an `order`-only PATCH — the one the board fires on every
  // drag — still reads nothing but projectId, while a status change pays one
  // more column on the same round-trip.
  const beforeSelect: Prisma.TaskSelect = { projectId: true };
  if (assigneeId !== undefined) beforeSelect.assigneeId = true;
  if (title !== undefined) beforeSelect.title = true;
  if (status !== undefined) beforeSelect.status = true;
  if (priority !== undefined) beforeSelect.priority = true;
  if (startDate !== undefined) beforeSelect.startDate = true;
  if (dueDate !== undefined) beforeSelect.dueDate = true;

  const before = (await prisma.task.findUnique({
    where: { id },
    select: beforeSelect,
  })) as (TaskSnapshot & { assigneeId?: string | null; projectId: string | null }) | null;
  if (!before) return notFound();

  // EDITOR on the task's current project, and — if this PATCH is filing it
  // somewhere else — EDITOR on the destination too. Reparenting inherits its
  // check from the parent's project via `data.projectId` above, so this one
  // check covers both paths.
  //
  // No access at all (404) collapses to the same "Task not found" GET would
  // give — but a VIEWER's 403 is forwarded as-is: they already know the task
  // exists (they can see it), so lying about that would just be confusing,
  // not protective.
  const currentAccess = await requireTaskProjectRole(guard.user, before.projectId, "EDITOR");
  if (currentAccess) return currentAccess.status === 404 ? notFound() : currentAccess;
  if (data.projectId !== undefined) {
    const destinationAccess = await requireTaskProjectRole(
      guard.user,
      data.projectId as string | null,
      "EDITOR"
    );
    if (destinationAccess) return destinationAccess;
  }

  const previousAssigneeId = before.assigneeId ?? null;

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

    // Field edits are a separate event from reassignment: a PATCH that both
    // moves a task to In Review and hands it over should tell the new owner
    // they own it, and tell everyone else what changed.
    const changes = summarizeTaskChanges(before, task);
    if (changes.length > 0) {
      after(() =>
        notifyTaskUpdated({
          taskId: task.id,
          changes,
          actorId: guard.user.id,
        })
      );
    }

    return NextResponse.json(serializeTask(task));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return notFound();
      // A well-formed uuid for a project that no longer exists — most likely an
      // MCP client working from a stale list.
      if (error.code === "P2003") {
        return NextResponse.json({ error: "Project not found" }, { status: 400 });
      }
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

  const existing = await prisma.task.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!existing) return notFound();

  // Same rule as PATCH: hide a task this member has no access to at all, but
  // don't lie to a VIEWER who can already see it.
  const rejection = await requireTaskProjectRole(guard.user, existing.projectId, "EDITOR");
  if (rejection) return rejection.status === 404 ? notFound() : rejection;

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

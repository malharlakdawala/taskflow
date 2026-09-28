import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireTaskProjectRole } from "@/lib/project-access";
import { sanitizeOrNull } from "@/lib/sanitize";
import { createCommentSchema, formatZodError } from "@/lib/validation";
import { serializeComment } from "@/lib/tasks";
import { notifyCommentAdded } from "@/lib/notifications/dispatch";

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
    select: { projectId: true },
  });
  if (!task) return notFound();

  const rejection = await requireTaskProjectRole(guard.user, task.projectId, "VIEWER");
  if (rejection) return notFound();

  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    include: { author: { select: { id: true, email: true, name: true, avatarUrl: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comments.map(serializeComment));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // The auth trigger guarantees the author row exists, so the authorId
  // foreign key resolves.
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parsed = createCommentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!task) return notFound();

  // Commenting is a write, so it needs the same EDITOR bar as any other
  // change to the task — a VIEWER can read the thread but not add to it. No
  // access at all reads as "not found"; a VIEWER's 403 is shown as-is, since
  // they can already see the task and a 404 would just be a confusing lie.
  const rejection = await requireTaskProjectRole(guard.user, task.projectId, "EDITOR");
  if (rejection) return rejection.status === 404 ? notFound() : rejection;

  const content = sanitizeOrNull(parsed.data.content);
  if (!content) {
    return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
  }

  const comment = await prisma.comment.create({
    data: {
      content,
      taskId: id,
      authorId: guard.user.id,
    },
    include: { author: { select: { id: true, email: true, name: true, avatarUrl: true } } },
  });

  after(() =>
    notifyCommentAdded({
      taskId: id,
      commentId: comment.id,
      commentHtml: content,
      actorId: guard.user.id,
    })
  );

  return NextResponse.json(serializeComment(comment), { status: 201 });
}

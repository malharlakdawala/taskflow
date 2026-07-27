import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser, unauthorized } from "@/lib/auth";
import { createCommentSchema, formatZodError } from "@/lib/validation";
import { serializeComment } from "@/lib/tasks";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const comments = await prisma.comment.findMany({
    where: { taskId: id },
    include: { author: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(comments.map(serializeComment));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // getCurrentDbUser guarantees the author row exists, so the authorId foreign
  // key resolves. Previously this inserted an auth uuid with no matching row.
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const parsed = createCommentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: {
      content: parsed.data.content,
      taskId: id,
      authorId: user.id,
    },
    include: { author: true },
  });

  return NextResponse.json(serializeComment(comment), { status: 201 });
}

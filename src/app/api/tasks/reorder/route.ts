import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { reorderTasksSchema, formatZodError } from "@/lib/validation";

/**
 * Persists a drag-and-drop rearrangement. The board sends every task whose
 * column or position changed; the writes run in one transaction so the board
 * never ends up half-reordered.
 */
export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = reorderTasksSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { tasks } = parsed.data;

  await prisma.$transaction(
    tasks.map(({ id, status, order }) =>
      prisma.task.update({ where: { id }, data: { status, order } })
    )
  );

  return NextResponse.json({ success: true, updated: tasks.length });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/** Full member list with approval state. Admin only. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const members = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      status: true,
      approvedAt: true,
      createdAt: true,
      _count: { select: { tasks: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    members.map(({ _count, ...member }) => ({
      ...member,
      assignedTaskCount: _count.tasks,
    }))
  );
}

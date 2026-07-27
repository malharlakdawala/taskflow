import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";

/** Roster for the assignee picker. Only approved members can be assigned work. */
export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, email: true, name: true, avatarUrl: true, role: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return NextResponse.json(users);
}

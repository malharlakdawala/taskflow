import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser, unauthorized } from "@/lib/auth";

/** Roster for the assignee picker. */
export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return unauthorized();

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, avatarUrl: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return NextResponse.json(users);
}

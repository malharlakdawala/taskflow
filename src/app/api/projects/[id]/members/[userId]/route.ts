import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-access";
import { updateProjectMemberSchema, formatZodError } from "@/lib/validation";

const notFound = () =>
  NextResponse.json({ error: "That person isn't on this project" }, { status: 404 });

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: {
    select: { id: true, email: true, name: true, avatarUrl: true },
  },
} satisfies Prisma.ProjectMemberSelect;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id, userId } = await params;
  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const parsed = updateProjectMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  try {
    const member = await prisma.projectMember.update({
      where: { projectId_userId: { projectId: id, userId } },
      data: { role: parsed.data.role },
      select: MEMBER_SELECT,
    });
    return NextResponse.json(member);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id, userId } = await params;
  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  try {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: id, userId } },
    });
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

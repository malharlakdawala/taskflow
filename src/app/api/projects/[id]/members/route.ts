import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-access";
import { addProjectMemberSchema, formatZodError } from "@/lib/validation";

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: {
    select: { id: true, email: true, name: true, avatarUrl: true },
  },
} satisfies Prisma.ProjectMemberSelect;

/** Read access is VIEWER-or-above: anyone on the project can see its roster. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const rejection = await requireProjectRole(guard.user, id, "VIEWER");
  if (rejection) return rejection;

  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    select: MEMBER_SELECT,
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

/**
 * Adds (or re-invites) one member by email. Only an EDITOR or admin may
 * change a project's roster — the same bar as editing its tasks.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const parsed = addProjectMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { email, role } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, status: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "No workspace member with that email" },
      { status: 404 }
    );
  }
  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "That person is not an approved member yet" },
      { status: 400 }
    );
  }

  // Upsert: adding someone who's already on the project just changes their
  // role, the same way re-inviting an existing address updates it rather than
  // erroring — one action covers "add" and "change role".
  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId: user.id } },
    create: { projectId: id, userId: user.id, role },
    update: { role },
    select: MEMBER_SELECT,
  });

  return NextResponse.json(member, { status: 201 });
}

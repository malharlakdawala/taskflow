import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { accessibleProjectsFilter } from "@/lib/project-access";
import { createProjectSchema, formatZodError } from "@/lib/validation";
import { PROJECT_LIST_SELECT, serializeProject } from "@/lib/projects";

/**
 * Names are unique case-insensitively through a functional index Prisma cannot
 * see, so a collision only ever surfaces here, as P2002 at write time.
 */
const duplicateName = () =>
  NextResponse.json(
    { error: "A project with that name already exists" },
    { status: 409 }
  );

export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  // Three queries rather than a correlated read per row: the projects, a
  // grouped tally of finished tasks, and this member's own role on each —
  // all joined in memory. The progress bar and the edit/view distinction
  // would otherwise cost a round-trip per project.
  const [projects, doneCounts, myMemberships] = await Promise.all([
    prisma.project.findMany({
      // A project this member has no access to doesn't exist as far as the
      // picker, the filter or this screen are concerned.
      where: accessibleProjectsFilter(guard.user),
      relationLoadStrategy: "join",
      select: PROJECT_LIST_SELECT,
      // Active projects first, then alphabetical: archived ones stay reachable
      // on this screen without pushing live work down the page.
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    prisma.task.groupBy({
      by: ["projectId"],
      where: { status: "DONE", projectId: { not: null } },
      _count: { _all: true },
    }),
    prisma.projectMember.findMany({
      where: { userId: guard.user.id },
      select: { projectId: true, role: true },
    }),
  ]);

  const doneByProject = new Map(
    doneCounts.map((row) => [row.projectId, row._count._all])
  );
  const myRoleByProject = new Map(
    myMemberships.map((m) => [m.projectId, m.role])
  );

  return NextResponse.json(
    projects.map((project) =>
      serializeProject(
        project,
        doneByProject.get(project.id) ?? 0,
        guard.user.role === "ADMIN"
          ? "EDITOR"
          : (myRoleByProject.get(project.id) ?? "VIEWER")
      )
    )
  );
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = createProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { name, description, color } = parsed.data;

  try {
    const project = await prisma.project.create({
      data: {
        name,
        description: description ?? null,
        color: color ?? null,
        createdById: guard.user.id,
        // The creator needs to be able to use what they just made.
        members: { create: { userId: guard.user.id, role: "EDITOR" } },
      },
      relationLoadStrategy: "join",
      select: PROJECT_LIST_SELECT,
    });

    // A project cannot have tasks yet, so the done tally is known without
    // asking, and its creator is always its first EDITOR.
    return NextResponse.json(serializeProject(project, 0, "EDITOR"), { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return duplicateName();
    }
    throw error;
  }
}

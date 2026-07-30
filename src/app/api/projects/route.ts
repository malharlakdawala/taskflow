import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
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

  // Two queries rather than a correlated count per row: the projects, and one
  // grouped tally of finished tasks, joined in memory. The progress bar would
  // otherwise cost a round-trip per project.
  const [projects, doneCounts] = await Promise.all([
    prisma.project.findMany({
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
  ]);

  const doneByProject = new Map(
    doneCounts.map((row) => [row.projectId, row._count._all])
  );

  return NextResponse.json(
    projects.map((project) =>
      serializeProject(project, doneByProject.get(project.id) ?? 0)
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
      },
      relationLoadStrategy: "join",
      select: PROJECT_LIST_SELECT,
    });

    // A project cannot have tasks yet, so the done tally is known without asking.
    return NextResponse.json(serializeProject(project, 0), { status: 201 });
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

import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { getProjectRole, requireProjectRole } from "@/lib/project-access";
import { updateProjectSchema, formatZodError } from "@/lib/validation";
import { PROJECT_LIST_SELECT, serializeProject } from "@/lib/projects";

const notFound = () =>
  NextResponse.json({ error: "Project not found" }, { status: 404 });

const duplicateName = () =>
  NextResponse.json(
    { error: "A project with that name already exists" },
    { status: 409 }
  );

/** How many of a project's tasks are finished, for the progress bar. */
function countDone(projectId: string) {
  return prisma.task.count({ where: { projectId, status: "DONE" } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const rejection = await requireProjectRole(guard.user, id, "VIEWER");
  if (rejection) return rejection;

  const [project, doneCount] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      relationLoadStrategy: "join",
      select: PROJECT_LIST_SELECT,
    }),
    countDone(id),
  ]);

  if (!project) return notFound();

  const myRole =
    guard.user.role === "ADMIN"
      ? "EDITOR"
      : ((await getProjectRole(guard.user.id, id)) ?? "VIEWER");

  return NextResponse.json(serializeProject(project, doneCount, myRole));
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const parsed = updateProjectSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { name, description, color, archived } = parsed.data;

  // Applied individually so only allow-listed columns can ever change.
  const data: Prisma.ProjectUncheckedUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (color !== undefined) data.color = color;
  if (archived !== undefined) data.archived = archived;

  try {
    // update() throws P2025 when the row is gone, which saves a pre-read.
    const [project, doneCount] = await Promise.all([
      prisma.project.update({
        where: { id },
        data,
        relationLoadStrategy: "join",
        select: PROJECT_LIST_SELECT,
      }),
      countDone(id),
    ]);

    // requireProjectRole already confirmed EDITOR (or admin) above.
    return NextResponse.json(serializeProject(project, doneCount, "EDITOR"));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return notFound();
      if (error.code === "P2002") return duplicateName();
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  // Counted before the delete so the UI can say what happened to the work.
  // `on delete set null` means these tasks survive as unfiled rather than
  // being destroyed, which is why this needs no typed confirmation.
  const orphaned = await prisma.task.count({ where: { projectId: id } });

  try {
    await prisma.project.delete({ where: { id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }

  return NextResponse.json({ success: true, orphaned });
}

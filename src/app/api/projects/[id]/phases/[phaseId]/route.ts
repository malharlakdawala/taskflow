import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-access";
import { updatePhaseSchema, formatZodError } from "@/lib/validation";
import { PHASE_LIST_SELECT, serializePhase } from "@/lib/phases";

const notFound = () =>
  NextResponse.json({ error: "Phase not found" }, { status: 404 });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id, phaseId } = await params;

  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const parsed = updatePhaseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { name, description, startDate, endDate, order } = parsed.data;

  // Applied individually so only allow-listed columns can ever change.
  const data: Prisma.PhaseUncheckedUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
  if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
  if (order !== undefined) data.order = order;

  try {
    // Scoped by projectId too, so a phase id from another project reads as
    // missing rather than being editable through this project's access check.
    const phase = await prisma.phase.update({
      where: { id: phaseId, projectId: id },
      data,
      select: PHASE_LIST_SELECT,
    });
    return NextResponse.json(serializePhase(phase));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return notFound();
      if (error.code === "P2002") {
        return NextResponse.json(
          { error: "This project already has a phase with that name" },
          { status: 409 }
        );
      }
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; phaseId: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id, phaseId } = await params;

  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  // `on delete set null`: the tasks stay in the project, just unphased.
  const unphased = await prisma.task.count({ where: { phaseId } });

  try {
    await prisma.phase.delete({ where: { id: phaseId, projectId: id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }

  return NextResponse.json({ success: true, unphased });
}

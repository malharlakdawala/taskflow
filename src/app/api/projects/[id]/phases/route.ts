import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-access";
import { countPhaseTasks } from "@/lib/phase-access";
import { createPhaseSchema, formatZodError } from "@/lib/validation";
import { PHASE_LIST_SELECT, PHASE_ORDER_BY, serializePhase } from "@/lib/phases";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const rejection = await requireProjectRole(guard.user, id, "VIEWER");
  if (rejection) return rejection;

  const [phases, counts] = await Promise.all([
    prisma.phase.findMany({
      where: { projectId: id },
      select: PHASE_LIST_SELECT,
      orderBy: PHASE_ORDER_BY,
    }),
    countPhaseTasks(id),
  ]);

  return NextResponse.json(phases.map((phase) => serializePhase(phase, counts)));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const parsed = createPhaseSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { name, description, startDate, endDate } = parsed.data;

  // New phases go after the last one — phases are a sequence, and the newest
  // stage of a project is almost always the latest one.
  const last = await prisma.phase.findFirst({
    where: { projectId: id },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  try {
    const phase = await prisma.phase.create({
      data: {
        projectId: id,
        name,
        description: description ?? null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        order: (last?.order ?? 0) + 1000,
      },
      select: PHASE_LIST_SELECT,
    });
    return NextResponse.json(serializePhase(phase), { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This project already has a phase with that name" },
        { status: 409 }
      );
    }
    throw error;
  }
}

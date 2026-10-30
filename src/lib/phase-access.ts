import "server-only";

import { prisma } from "@/lib/prisma";
import type { PhaseCounts } from "@/lib/phases";

/**
 * Whether `phaseId` is a phase of `projectId`. A phase only makes sense inside
 * its own project, so filing a task into another project's phase — or into a
 * phase while leaving it unfiled — is refused rather than silently stored.
 */
export async function phaseBelongsTo(
  phaseId: string,
  projectId: string | null
): Promise<boolean> {
  if (projectId === null) return false;
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    select: { projectId: true },
  });
  return phase?.projectId === projectId;
}

/** Task and done tallies for every phase of one project, in two aggregates. */
export async function countPhaseTasks(projectId: string): Promise<PhaseCounts> {
  const where = { projectId, parentId: null, phaseId: { not: null } };
  const [all, done] = await Promise.all([
    prisma.task.groupBy({ by: ["phaseId"], where, _count: { _all: true } }),
    prisma.task.groupBy({
      by: ["phaseId"],
      where: { ...where, status: "DONE" },
      _count: { _all: true },
    }),
  ]);

  const counts: PhaseCounts = new Map();
  for (const row of all) {
    counts.set(row.phaseId!, { taskCount: row._count._all, doneCount: 0 });
  }
  for (const row of done) {
    const entry = counts.get(row.phaseId!);
    if (entry) entry.doneCount = row._count._all;
  }
  return counts;
}

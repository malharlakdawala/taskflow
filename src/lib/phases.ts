import type { Prisma } from "@/generated/prisma/client";

/**
 * Query shapes for phases, beside lib/projects.ts and lib/tasks.ts for the
 * same reason: the routes, the pickers and the MCP tools must agree on what a
 * phase payload looks like.
 */

/** What a task payload carries about its phase — enough to render a chip. */
export const PHASE_SUMMARY = {
  id: true,
  name: true,
  order: true,
} satisfies Prisma.PhaseSelect;

export const PHASE_LIST_SELECT = {
  ...PHASE_SUMMARY,
  projectId: true,
  description: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PhaseSelect;

/** Phases in display order; ties (never expected) fall back to age. */
export const PHASE_ORDER_BY = [
  { order: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.PhaseOrderByWithRelationInput[];

type PhaseListRow = Prisma.PhaseGetPayload<{ select: typeof PHASE_LIST_SELECT }>;

/** Per-phase task and done counts, keyed by phase id. Subtasks don't count. */
export type PhaseCounts = Map<string, { taskCount: number; doneCount: number }>;

export function serializePhase(phase: PhaseListRow, counts?: PhaseCounts) {
  const tally = counts?.get(phase.id);
  return {
    ...phase,
    taskCount: tally?.taskCount ?? 0,
    doneCount: tally?.doneCount ?? 0,
  };
}

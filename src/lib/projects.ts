import type { Prisma } from "@/generated/prisma/client";
import { PROJECT_COLORS, type ProjectColor } from "@/lib/types";

/**
 * Query shapes for projects, kept beside the task equivalents in lib/tasks.ts
 * for the same reason: the board, the pickers and the MCP tools must all agree
 * on what a project payload looks like.
 */

/** What a task payload carries about its project — enough to render a chip. */
export const PROJECT_SUMMARY = {
  id: true,
  name: true,
  color: true,
  archived: true,
} satisfies Prisma.ProjectSelect;

/**
 * The projects screen. `_count` is one aggregate rather than a query per
 * project, and the done tally comes from a filtered count in the same round
 * trip — the progress bar would otherwise cost a request per row.
 */
export const PROJECT_LIST_SELECT = {
  ...PROJECT_SUMMARY,
  description: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { tasks: true } },
} satisfies Prisma.ProjectSelect;

type ProjectListRow = Prisma.ProjectGetPayload<{
  select: typeof PROJECT_LIST_SELECT;
}>;

/**
 * `color` is a plain text column, so a row written by hand or by an older
 * version of the app can hold anything. Anything unrecognised reads as null
 * rather than reaching a `data-project-color` attribute the CSS cannot match.
 */
export function asProjectColor(value: string | null): ProjectColor | null {
  return PROJECT_COLORS.includes(value as ProjectColor)
    ? (value as ProjectColor)
    : null;
}

export function serializeProject(
  project: ProjectListRow,
  doneCount: number = 0
) {
  const { _count, color, ...rest } = project;
  return {
    ...rest,
    color: asProjectColor(color),
    taskCount: _count.tasks,
    doneCount,
  };
}

/** Trimmed to what a chip needs, with the same colour guard applied. */
export function serializeProjectSummary<
  T extends { color: string | null },
>(project: T) {
  return { ...project, color: asProjectColor(project.color) };
}

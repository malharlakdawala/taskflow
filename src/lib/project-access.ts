import "server-only";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth";
import type { Prisma } from "@/generated/prisma/client";
import type { ProjectRole } from "@/generated/prisma/enums";

/**
 * Project-level access, layered on top of the existing workspace-wide roles.
 *
 * An admin bypasses membership entirely — same as everywhere else in the app.
 * A task with no project is unfiled and stays visible to every active member;
 * only a task filed into a project is gated by that project's roster. VIEWER
 * sees a project's tasks; EDITOR can also create, edit, delete them, and
 * manage who else is on the project.
 */

const notFound = (message = "Project not found") =>
  NextResponse.json({ error: message }, { status: 404 });

const forbidden = (message: string) =>
  NextResponse.json({ error: message }, { status: 403 });

export async function getProjectRole(
  userId: string,
  projectId: string
): Promise<ProjectRole | null> {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/**
 * Guards a route that touches one specific project. Returns an error
 * response, or null when the user may proceed at `minRole` or above.
 *
 * A project the caller cannot see at all reads as "not found" rather than
 * "forbidden" — same reasoning as a task in someone else's private data:
 * confirming a restricted project *exists* is itself information leakage.
 */
export async function requireProjectRole(
  user: AppUser,
  projectId: string,
  minRole: ProjectRole
): Promise<NextResponse | null> {
  if (user.role === "ADMIN") return null;

  const role = await getProjectRole(user.id, projectId);
  if (role === null) return notFound();
  if (minRole === "EDITOR" && role !== "EDITOR") {
    return forbidden("You have read-only access to this project");
  }
  return null;
}

/**
 * Same check for a task that may or may not be filed into a project. Null
 * `projectId` is always allowed — unfiled tasks are the shared inbox.
 */
export async function requireTaskProjectRole(
  user: AppUser,
  projectId: string | null,
  minRole: ProjectRole
): Promise<NextResponse | null> {
  if (projectId === null) return null;
  return requireProjectRole(user, projectId, minRole);
}

/** `where` clause restricting a Project query to what this user may see. */
export function accessibleProjectsFilter(user: AppUser): Prisma.ProjectWhereInput {
  if (user.role === "ADMIN") return {};
  return { members: { some: { userId: user.id } } };
}

/**
 * `where` clause restricting a Task query to what this user may see: unfiled
 * tasks, plus tasks in a project they belong to.
 */
export function accessibleTasksFilter(user: AppUser): Prisma.TaskWhereInput {
  if (user.role === "ADMIN") return {};
  return {
    OR: [{ projectId: null }, { project: { members: { some: { userId: user.id } } } }],
  };
}

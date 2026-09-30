import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { editableProjectsFilter } from "@/lib/project-access";
import {
  VAULT_ENTRY_SELECT_WITH_PROJECT,
  serializeVaultEntryWithProject,
} from "@/lib/vault";

/**
 * The workspace-wide vault: every credential filed under a project this
 * caller can edit, spanning every project at once. Individual creation still
 * goes through /api/projects/[id]/vault, which is where "which project" is
 * unambiguous — this route is read-only, for the cross-project view.
 */
export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const entries = await prisma.vaultEntry.findMany({
    where: { project: editableProjectsFilter(guard.user) },
    select: VAULT_ENTRY_SELECT_WITH_PROJECT,
    orderBy: [{ project: { name: "asc" } }, { name: "asc" }],
  });

  return NextResponse.json(entries.map(serializeVaultEntryWithProject));
}

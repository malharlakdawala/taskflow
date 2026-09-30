import "server-only";

import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectRole } from "@/lib/project-access";
import type { AppUser } from "@/lib/auth";

/** Only the user fields the UI renders. */
const USER_SUMMARY = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/**
 * `secret` is selected here only so serializeVaultEntry can tell whether one
 * is set — it is stripped from every response. The decrypted plaintext is
 * never part of a list; only the dedicated reveal endpoint reads and decrypts
 * it, on request, one entry at a time.
 */
export const VAULT_ENTRY_SELECT = {
  id: true,
  projectId: true,
  name: true,
  username: true,
  secret: true,
  url: true,
  notes: true,
  createdById: true,
  createdBy: { select: USER_SUMMARY },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.VaultEntrySelect;

type VaultEntryRow = Prisma.VaultEntryGetPayload<{ select: typeof VAULT_ENTRY_SELECT }>;

export function serializeVaultEntry(entry: VaultEntryRow) {
  const { secret, ...rest } = entry;
  return { ...rest, hasPassword: secret !== null };
}

const notFound = () =>
  NextResponse.json({ error: "Vault entry not found" }, { status: 404 });

/**
 * Shared by the update/delete/reveal routes, all of which take a bare entry
 * id with no project id alongside it: look the entry up, then check EDITOR
 * access to whatever project it's actually filed under. An entry the caller
 * can't reach reads as 404 either way — whether it doesn't exist or they just
 * can't see it is not a distinction worth making for a credential store.
 */
export async function resolveVaultEntry(
  user: AppUser,
  entryId: string
): Promise<{ entry: VaultEntryRow } | { rejection: NextResponse }> {
  const entry = await prisma.vaultEntry.findUnique({
    where: { id: entryId },
    select: VAULT_ENTRY_SELECT,
  });
  if (!entry) return { rejection: notFound() };

  const rejection = await requireProjectRole(user, entry.projectId, "EDITOR");
  if (rejection) return { rejection: notFound() };

  return { entry };
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { requireProjectRole } from "@/lib/project-access";
import { createVaultEntrySchema, formatZodError } from "@/lib/validation";
import { VAULT_ENTRY_SELECT, serializeVaultEntry } from "@/lib/vault";
import { encryptSecret } from "@/lib/vault-crypto";

/**
 * Gated at EDITOR, not VIEWER — a project's read-only members never see this
 * endpoint's data at all. A project outside the caller's access reads as 404,
 * same convention as every other project-scoped route.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const rejection = await requireProjectRole(guard.user, id, "EDITOR");
  if (rejection) return rejection;

  const entries = await prisma.vaultEntry.findMany({
    where: { projectId: id },
    select: VAULT_ENTRY_SELECT,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(entries.map(serializeVaultEntry));
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

  const parsed = createVaultEntrySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { name, username, password, url, notes } = parsed.data;

  const entry = await prisma.vaultEntry.create({
    data: {
      projectId: id,
      name,
      username: username ?? null,
      // Encrypted before it ever reaches the database — see vault-crypto.ts.
      secret: password ? encryptSecret(password) : null,
      url: url ?? null,
      notes: notes ?? null,
      createdById: guard.user.id,
    },
    select: VAULT_ENTRY_SELECT,
  });

  return NextResponse.json(serializeVaultEntry(entry), { status: 201 });
}

import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { updateVaultEntrySchema, formatZodError } from "@/lib/validation";
import { VAULT_ENTRY_SELECT, serializeVaultEntry, resolveVaultEntry } from "@/lib/vault";
import { encryptSecret } from "@/lib/vault-crypto";

const notFound = () =>
  NextResponse.json({ error: "Vault entry not found" }, { status: 404 });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const resolved = await resolveVaultEntry(guard.user, id);
  if ("rejection" in resolved) return resolved.rejection;

  const parsed = updateVaultEntrySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { name, username, password, url, notes } = parsed.data;

  // Applied individually so only allow-listed columns can ever change.
  const data: Prisma.VaultEntryUncheckedUpdateInput = {};
  if (name !== undefined) data.name = name;
  if (username !== undefined) data.username = username;
  // A new password is re-encrypted; absent means "leave it alone" (there is
  // no way to explicitly clear one — see the schema's own note on this).
  if (password !== undefined) data.secret = encryptSecret(password);
  if (url !== undefined) data.url = url;
  if (notes !== undefined) data.notes = notes;

  try {
    const entry = await prisma.vaultEntry.update({
      where: { id },
      data,
      select: VAULT_ENTRY_SELECT,
    });
    return NextResponse.json(serializeVaultEntry(entry));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
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
  const resolved = await resolveVaultEntry(guard.user, id);
  if ("rejection" in resolved) return resolved.rejection;

  try {
    await prisma.vaultEntry.delete({ where: { id } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return notFound();
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}

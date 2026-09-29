import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth";
import { resolveVaultEntry } from "@/lib/vault";
import { decryptSecret } from "@/lib/vault-crypto";

/**
 * The one place the plaintext password ever leaves the server. A POST rather
 * than GET on purpose — revealing a credential is an action worth being
 * deliberate about, not something a prefetch or a browser back/forward cache
 * should be able to trigger silently.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const resolved = await resolveVaultEntry(guard.user, id);
  if ("rejection" in resolved) return resolved.rejection;

  const { entry } = resolved;
  if (!entry.secret) {
    return NextResponse.json({ password: null });
  }

  return NextResponse.json({ password: decryptSecret(entry.secret) });
}

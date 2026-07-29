import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Revokes a token.
 *
 * deleteMany rather than delete, with the owner in the filter: a token
 * belonging to someone else matches nothing and comes back as a 404, which is
 * the same answer an id that never existed gets. Nobody learns anything from
 * guessing.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  // The column is a uuid, so a malformed id is a driver error rather than a
  // miss. Same 404 either way.
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const result = await prisma.apiToken.deleteMany({
    where: { id, userId: guard.user.id },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

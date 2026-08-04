import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

/**
 * Revokes an invitation. Admin only.
 *
 * Deleted rather than flagged: an offer nobody took up is not worth a record,
 * and deleting it is what makes the link stop working. An *accepted* invitation
 * is history — it is how a member came to be one — so this refuses those.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const { count } = await prisma.invitation.deleteMany({
    where: { id, acceptedAt: null },
  });

  if (count === 0) {
    return NextResponse.json(
      { error: "That invitation has already been used or revoked." },
      { status: 404 }
    );
  }

  return new NextResponse(null, { status: 204 });
}

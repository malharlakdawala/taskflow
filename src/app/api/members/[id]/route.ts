import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { updateMemberSchema, formatZodError } from "@/lib/validation";
import { notifyAccountApproved } from "@/lib/notifications/dispatch";

/**
 * Approve, reject, revoke, or change the role of a member. Admin only.
 *
 * Guards against an admin locking everyone out: you cannot demote or
 * deactivate yourself, and the last remaining admin cannot be removed.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parsed = updateMemberSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { role, status } = parsed.data;

  if (id === guard.user.id && (role === "MEMBER" || status !== undefined)) {
    return NextResponse.json(
      { error: "You cannot change your own role or approval status." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, status: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const losesAdmin =
    target.role === "ADMIN" && (role === "MEMBER" || (status && status !== "ACTIVE"));
  if (losesAdmin) {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE" },
    });
    if (admins <= 1) {
      return NextResponse.json(
        { error: "There must be at least one active admin." },
        { status: 400 }
      );
    }
  }

  const member = await prisma.user.update({
    where: { id },
    data: {
      ...(role !== undefined && { role }),
      ...(status !== undefined && {
        status,
        approvedAt: status === "ACTIVE" ? new Date() : null,
        approvedById: status === "ACTIVE" ? guard.user.id : null,
      }),
    },
    select: {
      id: true, email: true, name: true, avatarUrl: true,
      role: true, status: true, approvedAt: true, createdAt: true,
    },
  });

  // Only on the PENDING → ACTIVE transition. Re-saving an already-active
  // member's role should not tell them again that they've been approved.
  if (status === "ACTIVE" && target.status !== "ACTIVE") {
    after(() =>
      notifyAccountApproved({ memberId: id, approverId: guard.user.id })
    );

    // Someone invited by email who signed up the ordinary way instead, and got
    // approved from the queue above. Their invitation is spent either way, and
    // leaving it outstanding would keep a live link to an account that already
    // has access.
    after(() =>
      prisma.invitation
        .updateMany({
          where: { email: member.email, acceptedAt: null },
          data: { acceptedAt: new Date() },
        })
        .catch((error) =>
          console.error("[members] could not close invitation:", error)
        )
    );
  }

  return NextResponse.json(member);
}

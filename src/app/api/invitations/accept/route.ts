import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppUser, unauthorized } from "@/lib/auth";
import { acceptInvitationSchema, formatZodError } from "@/lib/validation";
import {
  hashInvitationToken,
  isExpired,
  normalizeEmail,
} from "@/lib/invitations";

/**
 * Claims an invitation for the signed-in account.
 *
 * The only write in this app performed by someone who is not yet a member, and
 * the only one that grants access, so it is worth being explicit about what has
 * to be true:
 *
 *   1. There is a session. The token alone grants nothing — it says which
 *      offer is being claimed, not who is claiming it.
 *   2. The session's email is the invited address. Otherwise a forwarded link
 *      would let whoever received it in under their own account.
 *   3. The invitation is unclaimed and unexpired.
 *
 * A POST rather than something the invite page does while rendering: a GET that
 * grants access would fire on a link prefetch, and be replayed by anything that
 * follows links.
 */
export async function POST(request: Request) {
  const user = await getAppUser();
  if (!user) return unauthorized();

  const parsed = acceptInvitationSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(parsed.data.token) },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      invitedById: true,
    },
  });

  if (!invitation) {
    return NextResponse.json(
      { error: "This invitation link is not valid." },
      { status: 404 }
    );
  }

  if (invitation.acceptedAt) {
    return NextResponse.json(
      { error: "This invitation has already been used." },
      { status: 410 }
    );
  }

  if (isExpired(invitation)) {
    return NextResponse.json(
      { error: "This invitation has expired. Ask for a new one." },
      { status: 410 }
    );
  }

  if (normalizeEmail(invitation.email) !== normalizeEmail(user.email)) {
    return NextResponse.json(
      {
        error:
          `This invitation was sent to ${invitation.email}, but you are signed ` +
          `in as ${user.email}. Sign out and use the invited address.`,
      },
      { status: 403 }
    );
  }

  // Being invited as a member should never cost an existing admin their role.
  const role =
    invitation.role === "ADMIN" || user.role === "ADMIN" ? "ADMIN" : "MEMBER";

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        status: "ACTIVE",
        role,
        approvedAt: new Date(),
        // Who vouched for them, same column the approval queue writes.
        approvedById: invitation.invitedById,
      },
    }),
    prisma.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  // Deliberately no notification. The "your account was approved" mail exists
  // to reach someone who is not looking at the app; this person just clicked a
  // button in it, and the next thing they see is the board.
  return NextResponse.json({ ok: true, role });
}

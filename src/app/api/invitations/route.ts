import { NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import {
  createInvitationsSchema,
  formatZodError,
} from "@/lib/validation";
import {
  INVITATION_SELECT,
  invitationUrl,
  isExpired,
  issueInvitation,
  normalizeEmail,
} from "@/lib/invitations";
import {
  notifyAccountApproved,
  sendWorkspaceInvite,
} from "@/lib/notifications/dispatch";
import type { InviteResult } from "@/lib/types";

/**
 * Invitations. Admin only.
 *
 * One address at a time is the same code as twenty, so this takes a list and
 * answers per address. Each one lands in one of three places:
 *
 *   - No account exists → an invitation row and a link, mailed if the
 *     deployment can send mail and returned either way.
 *   - An account exists but is not active (a sign-up waiting for approval, or
 *     someone previously revoked) → nothing to invite. They are let straight
 *     in, which is the honest reading of "add this person".
 *   - An active member → nothing to do, and saying so beats a silent success.
 *
 * A failure on one address never fails the others: the admin who pasted a list
 * of ten wants the nine good ones to go through.
 */

/**
 * Everything still outstanding, expired ones included — an invitation that
 * quietly vanished on its fourteenth day would leave the admin wondering
 * whether they ever sent it. Whether it has lapsed is decided here rather than
 * in the browser, because this is the clock that the accept endpoint uses.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const invitations = await prisma.invitation.findMany({
    where: { acceptedAt: null },
    select: INVITATION_SELECT,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    invitations.map((invitation) => ({
      ...invitation,
      expired: isExpired(invitation),
    }))
  );
}

/**
 * A ceiling on how many invitations can be outstanding at once. Not a quota
 * anyone should ever meet — it is there so a script cannot fill the table.
 */
const MAX_OUTSTANDING = 200;

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = createInvitationsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const { role } = parsed.data;
  // Two spellings of the same address in one paste is one invitation.
  const emails = [...new Set(parsed.data.emails.map(normalizeEmail))];

  const outstanding = await prisma.invitation.count({
    where: { acceptedAt: null },
  });
  if (outstanding + emails.length > MAX_OUTSTANDING) {
    return NextResponse.json(
      {
        error:
          `There are already ${outstanding} invitations outstanding. ` +
          "Revoke some before sending more.",
      },
      { status: 400 }
    );
  }

  const results: InviteResult[] = [];

  for (const email of emails) {
    try {
      results.push(await inviteOne({ email, role, adminId: guard.user.id }));
    } catch (error) {
      console.error(`[invitations] ${email} failed:`, error);
      results.push({
        email,
        outcome: "failed",
        error: error instanceof Error ? error.message : "Something went wrong",
      });
    }
  }

  return NextResponse.json({ results }, { status: 201 });
}

async function inviteOne({
  email,
  role,
  adminId,
}: {
  email: string;
  role: "ADMIN" | "MEMBER";
  adminId: string;
}): Promise<InviteResult> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, status: true },
  });

  if (existing) {
    if (existing.status === "ACTIVE") {
      // Includes the admin typing in their own address.
      return { email, outcome: "already-member" };
    }

    await prisma.user.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        // Never demote on the way in. Inviting an existing admin as a member is
        // far more likely to be a paste than an intention.
        role: role === "ADMIN" || existing.role === "ADMIN" ? "ADMIN" : "MEMBER",
        approvedAt: new Date(),
        approvedById: adminId,
      },
    });

    // Any invitation still open for this address is now moot.
    await prisma.invitation.updateMany({
      where: { email, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });

    after(() =>
      notifyAccountApproved({ memberId: existing.id, approverId: adminId })
    );

    return { email, outcome: "added" };
  }

  const { token, hash, expiresAt } = issueInvitation();

  // One live invitation per address: a second invite replaces the first, which
  // also makes "resend" the same operation as "invite" with nothing extra.
  const previous = await prisma.invitation.findUnique({
    where: { email },
    select: { id: true },
  });

  await prisma.invitation.upsert({
    where: { email },
    create: {
      email,
      role,
      tokenHash: hash,
      expiresAt,
      invitedById: adminId,
    },
    update: {
      role,
      tokenHash: hash,
      expiresAt,
      invitedById: adminId,
      // Reissuing revives a row whose invitation was already claimed — which
      // only happens if the account was since deleted from Supabase Auth.
      acceptedAt: null,
    },
  });

  const url = invitationUrl(token);
  const emailed = await sendWorkspaceInvite({
    email,
    inviteUrl: url,
    role,
    expiresAt,
    inviterId: adminId,
  });

  return {
    email,
    outcome: previous ? "resent" : "invited",
    inviteUrl: url,
    emailed,
  };
}

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAppUser } from "@/lib/auth";
import {
  hashInvitationToken,
  isExpired,
  normalizeEmail,
} from "@/lib/invitations";
import { InviteAccept } from "@/components/invite/invite-accept";
import { displayName } from "@/lib/utils";

/**
 * Where an invitation link lands.
 *
 * Reachable without a session — that is the point of it — so it runs on the
 * server, looks the token up, and hands the client component one of a small
 * number of states rather than the invitation itself. Nothing about the
 * workspace leaks from an invalid token: an unknown, spent or expired link all
 * say only that, and only a valid one names the address it was sent to.
 *
 * This page never writes. Accepting is a POST from the client, because a page
 * that granted access while rendering would do it on a link prefetch.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invitation, user] = await Promise.all([
    prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        invitedBy: { select: { name: true, email: true } },
      },
    }),
    getAppUser(),
  ]);

  if (!invitation) return <InviteAccept state="invalid" token={token} />;
  if (invitation.acceptedAt) return <InviteAccept state="used" token={token} />;

  const inviter = invitation.invitedBy
    ? displayName(invitation.invitedBy)
    : "An administrator";

  if (isExpired(invitation)) {
    return <InviteAccept state="expired" token={token} inviter={inviter} />;
  }

  const shared = {
    token,
    email: invitation.email,
    inviter,
    asAdmin: invitation.role === "ADMIN",
  };

  // Nobody signed in: they need an account on this address first. If they
  // already have one the component points them at sign-in and back here.
  if (!user) return <InviteAccept state="sign-up" {...shared} />;

  if (normalizeEmail(user.email) !== normalizeEmail(invitation.email)) {
    return <InviteAccept state="wrong-account" {...shared} signedInAs={user.email} />;
  }

  // Already in — an invitation to an active member is a no-op, and bouncing
  // them to the board is more use than telling them so.
  if (user.status === "ACTIVE" && (user.role === "ADMIN" || !shared.asAdmin)) {
    redirect("/board");
  }

  return <InviteAccept state="accept" {...shared} signedInAs={user.email} />;
}

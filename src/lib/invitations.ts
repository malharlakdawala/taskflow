import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "@/lib/email/client";
import type { UserRole } from "@/generated/prisma/enums";

/**
 * Workspace invitations.
 *
 * An invitation is a row and a link. The link carries 256 bits of randomness;
 * only its hash is stored, so the plaintext exists in one place — the email —
 * and a leaked copy of the table cannot be turned into access.
 *
 * Acceptance is keyed on that token rather than on the email address, and the
 * distinction matters: if it matched on email alone, then on a deployment with
 * Supabase's email confirmation switched off anyone could type an invited
 * colleague's address into the sign-up form and be let straight in. Holding the
 * token is proof of having received the mail; nothing else is.
 *
 * SHA-256 rather than a password hash, for the same reason as MCP tokens: this
 * is randomness we generated, not a secret a human chose, so there is no
 * dictionary for a slow hash to defend against.
 */

/**
 * Long enough to survive a holiday, short enough that a forgotten invitation
 * stops being a way in. Re-inviting reissues the token, so this is not a
 * deadline anyone is stuck with.
 */
export const INVITE_TTL_DAYS = 14;

export interface IssuedInvitation {
  /** Goes in the link, and is never stored. */
  token: string;
  hash: string;
  expiresAt: Date;
}

export function issueInvitation(): IssuedInvitation {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashInvitationToken(token),
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
  };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Addresses are compared and stored lower-cased. Supabase Auth normalises the
 * same way, so `invitation.email === user.email` holds however the admin typed
 * it in.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Where the invited person lands. Absolute, because it goes in an email. */
export function invitationUrl(token: string): string {
  return `${appUrl()}/invite/${token}`;
}

/** The columns the settings screen and the invite page need. */
export const INVITATION_SELECT = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, name: true, email: true } },
} as const;

export interface InvitationRow {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  invitedBy: { id: string; name: string | null; email: string } | null;
}

export const isExpired = (invitation: { expiresAt: Date }): boolean =>
  invitation.expiresAt.getTime() <= Date.now();

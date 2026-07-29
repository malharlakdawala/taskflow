import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth";

/**
 * Personal access tokens for the hosted MCP endpoint.
 *
 * Only the hash is ever stored, so the plaintext exists exactly once — in the
 * response that created it. A leaked copy of the table cannot be replayed.
 *
 * SHA-256 rather than a password hash on purpose: these are 256 bits of
 * randomness we generated ourselves, not something a human chose, so there is
 * no dictionary to slow an attacker down with — and the cost would be paid on
 * every single MCP call.
 */

const PREFIX = "tf_live_";
/** Enough of the token to recognise it in a list, far too little to use. */
const VISIBLE_CHARS = 6;

export interface IssuedToken {
  /** Shown once. Never recoverable afterwards. */
  token: string;
  prefix: string;
  hash: string;
}

export function issueToken(): IssuedToken {
  const secret = randomBytes(32).toString("base64url");
  const token = `${PREFIX}${secret}`;
  return {
    token,
    prefix: `${PREFIX}${secret.slice(0, VISIBLE_CHARS)}`,
    hash: hashToken(token),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Pulls the bearer token out of a request, if there is a well-formed one. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer") return null;

  const value = rest.join("");
  return value.startsWith(PREFIX) ? value : null;
}

/**
 * `lastUsedAt` is what tells someone a token they forgot about is still in
 * use, but an MCP session is chatty and a write per call is pure noise. An
 * hour's resolution answers the question this field is actually asked.
 */
const LAST_USED_RESOLUTION_MS = 3_600_000;

/**
 * Resolves a bearer token to the member it belongs to.
 *
 * Returns null for anything that isn't a live token on an approved account —
 * a revoked token, a member who has since been deactivated, or a value that
 * was never a token at all all look identical from outside.
 */
export async function userForToken(token: string): Promise<AppUser | null> {
  const hash = hashToken(token);

  const record = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      tokenHash: true,
      lastUsedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          status: true,
        },
      },
    },
  });

  if (!record) return null;

  // The lookup was by unique hash so this can only match, but comparing in
  // constant time costs nothing and keeps the habit intact.
  const presented = Buffer.from(hash, "hex");
  const stored = Buffer.from(record.tokenHash, "hex");
  if (presented.length !== stored.length) return null;
  if (!timingSafeEqual(presented, stored)) return null;

  if (record.user.status !== "ACTIVE") return null;

  const stale =
    !record.lastUsedAt ||
    Date.now() - record.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS;
  if (stale) {
    // Best-effort: a failed bookkeeping write must not fail the call.
    prisma.apiToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch((error) => console.error("[mcp] could not stamp token use:", error));
  }

  return record.user;
}

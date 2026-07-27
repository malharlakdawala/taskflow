import "server-only";

import { NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const forbidden = (message = "Forbidden") =>
  NextResponse.json({ error: message }, { status: 403 });

export const pendingApproval = () =>
  NextResponse.json(
    { error: "Your account is awaiting approval from an administrator." },
    { status: 403 }
  );

/**
 * The signed-in user's id, verified cryptographically.
 *
 * getUser() asks the Supabase Auth server to validate the token, which is a
 * network round-trip costing 150-500ms to the Tokyo region on every single
 * request. This project signs tokens with ES256 and publishes a JWKS, so
 * getClaims() verifies the signature locally against a cached key instead —
 * same security guarantee, no network call.
 */
export async function getSessionUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
}

/** Full user object from the Auth server. Only needed where profile metadata matters. */
export async function getSessionUser(): Promise<SupabaseUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  status: UserStatus;
};

/**
 * Loads the application user for the current session.
 *
 * This used to upsert on every request as a safety net, which cost a full
 * database round-trip (~140ms to the Tokyo region) on every single API call.
 * The on_auth_user_created trigger already guarantees the row exists, so a
 * plain indexed lookup is enough — and it is the same query the caller needs
 * anyway to check role and approval status.
 */
export async function getAppUser(): Promise<AppUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      role: true,
      status: true,
    },
  });
}

type Guard =
  | { ok: true; user: AppUser }
  | { ok: false; response: NextResponse };

/** Requires an approved member. Use at the top of every data route. */
export async function requireMember(): Promise<Guard> {
  const user = await getAppUser();
  if (!user) return { ok: false, response: unauthorized() };
  if (user.status !== "ACTIVE") return { ok: false, response: pendingApproval() };
  return { ok: true, user };
}

/** Requires an approved admin. */
export async function requireAdmin(): Promise<Guard> {
  const guard = await requireMember();
  if (!guard.ok) return guard;
  if (guard.user.role !== "ADMIN") {
    return { ok: false, response: forbidden("Admin access required") };
  }
  return guard;
}

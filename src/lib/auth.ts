import "server-only";

import { NextResponse } from "next/server";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Returns the signed-in Supabase user, or null. Always use this rather than
 * trusting a client-supplied id.
 */
export async function getSessionUser(): Promise<SupabaseUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns the signed-in user and guarantees a matching row exists in
 * taskflow."User", so foreign keys on Task/Comment always resolve.
 *
 * The on_auth_user_created database trigger normally does this at sign-up; the
 * upsert here is a safety net for accounts created outside that path.
 */
export async function getCurrentDbUser() {
  const user = await getSessionUser();
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const name =
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    null;
  const avatarUrl =
    typeof metadata.avatar_url === "string" ? metadata.avatar_url : null;

  return prisma.user.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? `${user.id}@unknown.local`,
      name,
      avatarUrl,
    },
    update: {
      email: user.email ?? undefined,
      ...(name ? { name } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    },
  });
}

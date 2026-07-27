"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-in and sign-up run client-side (see login/page.tsx and signup/page.tsx)
 * so they can surface Supabase's error messages inline. Sign-out stays a server
 * action so the auth cookies are cleared on the server.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * NEXT_PUBLIC_* values are inlined at build time, so a deployment built before
 * its environment variables were set will carry `undefined` here no matter what
 * the dashboard says. Reading them through this helper turns that into a
 * readable message instead of an opaque 500 from deep inside @supabase/ssr.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function missingSupabaseEnv(): string[] {
  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return missing;
}

export function supabaseEnvError(): string {
  return (
    `Missing environment variable(s): ${missingSupabaseEnv().join(", ")}. ` +
    "These are inlined at build time, so after adding them in Vercel → Settings → " +
    "Environment Variables you must redeploy for the values to take effect. " +
    "Locally, set them in .env.local and restart the dev server."
  );
}

/** Throws a descriptive error rather than letting the Supabase SDK fail opaquely. */
export function requireSupabaseEnv() {
  if (missingSupabaseEnv().length > 0) {
    throw new Error(supabaseEnvError());
  }
  return { url: url as string, anonKey: anonKey as string };
}

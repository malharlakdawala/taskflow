import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "@/lib/supabase/config";

export function createClient() {
  const { url, anonKey } = requireSupabaseEnv();
  return createBrowserClient(url, anonKey);
}

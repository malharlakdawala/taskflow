import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const ATTACHMENT_BUCKET = "task-attachments";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/** Strips anything that would be awkward or unsafe in an object key. */
function safeName(filename: string) {
  const cleaned = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(-100) || "file";
}

type UploadResult = { url: string; path: string } | { error: string };

/**
 * Uploads under a per-user prefix, which is what the storage RLS policies key
 * off of. Returns a public URL — the bucket is public-read.
 */
export async function uploadToBucket(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<UploadResult> {
  const path = `${userId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  const { error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });

  if (error) return { error: error.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);

  return { url: publicUrl, path };
}

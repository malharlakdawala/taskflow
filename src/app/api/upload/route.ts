import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { ATTACHMENT_BUCKET, MAX_UPLOAD_BYTES, uploadToBucket } from "@/lib/storage";

/**
 * Bare upload used by the rich-text editor for inline images. It returns a URL
 * only — attachments that belong to a task go through
 * POST /api/tasks/[id]/attachments so a database row is created too.
 */
export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit` },
      { status: 413 }
    );
  }

  const supabase = await createClient();
  const result = await uploadToBucket(supabase, guard.user.id, file);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    url: result.url,
    filename: file.name,
    fileSize: file.size,
    mimeType: file.type,
    bucket: ATTACHMENT_BUCKET,
  });
}

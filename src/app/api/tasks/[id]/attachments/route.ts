import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, uploadToBucket } from "@/lib/storage";

/**
 * Uploads a file to Supabase Storage AND records it against the task. The old
 * /api/upload route did the first half only, so attachments were never
 * persisted and never appeared on a task.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

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

  const attachment = await prisma.attachment.create({
    data: {
      filename: file.name,
      url: result.url,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      taskId: id,
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}

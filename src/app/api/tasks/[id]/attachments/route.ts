import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, uploadToBucket } from "@/lib/storage";
import { createAttachmentSchema, formatZodError } from "@/lib/validation";

/**
 * Attaches a file to a task, two ways:
 *
 *  - multipart/form-data with a `file` — uploads to storage, then records it.
 *  - application/json with {url, filename, fileSize, mimeType} — records a file
 *    that was already uploaded. The create-task dialog needs this because
 *    files are chosen before the task exists, so they go to storage first and
 *    are registered once the task has an id.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = createAttachmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const attachment = await prisma.attachment.create({
      data: { ...parsed.data, taskId: id },
    });
    return NextResponse.json(attachment, { status: 201 });
  }

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

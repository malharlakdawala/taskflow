import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { requireTaskProjectRole } from "@/lib/project-access";
import { MAX_UPLOAD_BYTES, uploadToBucket } from "@/lib/storage";
import { createAttachmentSchema, formatZodError } from "@/lib/validation";

const notFound = () =>
  NextResponse.json({ error: "Task not found" }, { status: 404 });

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

  // Attaching a file is a write on the task, same bar as editing it — a
  // VIEWER can look but not add to it.
  const task = await prisma.task.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!task) return notFound();

  const rejection = await requireTaskProjectRole(guard.user, task.projectId, "EDITOR");
  if (rejection) return rejection.status === 404 ? notFound() : rejection;

  if (request.headers.get("content-type")?.includes("application/json")) {
    const parsed = createAttachmentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }

    const attachment = await prisma.attachment.create({
      data: { ...parsed.data, taskId: id },
    });
    return NextResponse.json(attachment, { status: 201 });
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

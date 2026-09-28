import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/auth";
import { requireTaskProjectRole } from "@/lib/project-access";
import { ATTACHMENT_BUCKET } from "@/lib/storage";

const notFound = () =>
  NextResponse.json({ error: "Attachment not found" }, { status: 404 });

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { task: { select: { projectId: true } } },
  });
  if (!attachment) return notFound();

  // Same EDITOR bar as any other change to the task it belongs to.
  const rejection = await requireTaskProjectRole(
    guard.user,
    attachment.task.projectId,
    "EDITOR"
  );
  if (rejection) return rejection.status === 404 ? notFound() : rejection;

  // Best effort: drop the stored object, then always remove the row so a
  // storage failure can't leave an undeletable attachment in the UI.
  const marker = `/${ATTACHMENT_BUCKET}/`;
  const objectPath = attachment.url.split(marker)[1];
  if (objectPath) {
    const supabase = await createClient();
    await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .remove([decodeURIComponent(objectPath)]);
  }

  await prisma.attachment.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

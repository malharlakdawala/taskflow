import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { updateEmailPreferencesSchema, formatZodError } from "@/lib/validation";

/**
 * Per-member email preferences (Settings → Notifications). These only ever
 * gate the emailed copy of an event — the in-app feed is unaffected, so
 * turning every one of these off still leaves the bell working.
 */
export async function PATCH(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = updateEmailPreferencesSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: guard.user.id },
    data: parsed.data,
    select: {
      emailOnAssigned: true,
      emailOnComment: true,
      emailOnDueSoon: true,
    },
  });

  return NextResponse.json(user);
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth";
import { formatZodError } from "@/lib/validation";
import { issueToken } from "@/lib/mcp/tokens";

/**
 * A member's own MCP tokens.
 *
 * Every query is scoped to `guard.user.id` — there is no id in the URL to
 * tamper with, and an admin has no more access here than anyone else. Tokens
 * are the one thing in this app that is genuinely private to one person.
 */

/** Somewhere between "useful label" and "not a novel in the settings list". */
const createSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name").max(60),
});

/** Enough for a laptop, a desktop and a spare, without becoming a liability. */
const MAX_TOKENS = 10;

export async function GET() {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const tokens = await prisma.apiToken.findMany({
    where: { userId: guard.user.id },
    // Deliberately not tokenHash. Nothing that could be replayed leaves here.
    select: {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(tokens);
}

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const count = await prisma.apiToken.count({ where: { userId: guard.user.id } });
  if (count >= MAX_TOKENS) {
    return NextResponse.json(
      { error: `You already have ${MAX_TOKENS} tokens. Revoke one first.` },
      { status: 400 }
    );
  }

  const { token, prefix, hash } = issueToken();

  const record = await prisma.apiToken.create({
    data: {
      userId: guard.user.id,
      name: parsed.data.name,
      prefix,
      tokenHash: hash,
    },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });

  // The only time the plaintext exists outside the caller's machine. It is
  // not stored, so this response cannot be reissued.
  return NextResponse.json({ ...record, token, lastUsedAt: null }, { status: 201 });
}

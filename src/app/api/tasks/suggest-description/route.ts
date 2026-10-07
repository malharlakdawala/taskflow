import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateText } from "ai";
import { requireMember } from "@/lib/auth";
import { formatZodError, suggestTaskDescriptionSchema } from "@/lib/validation";
import { getPostHogServerClient } from "@/lib/posthog-server";

/**
 * TaskFlow's one real LLM call: draft a short description from a task title,
 * via Vercel's AI Gateway (authenticated by OIDC on Vercel, no API key to
 * manage). Every call is captured as a $ai_generation event — this is the
 * thing PostHog's LLM analytics actually has something to watch.
 */
const MODEL = "anthropic/claude-haiku-4.5";

export async function POST(request: Request) {
  const guard = await requireMember();
  if (!guard.ok) return guard.response;

  const parsed = suggestTaskDescriptionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }
  const { title } = parsed.data;

  const prompt =
    `Write a short, one-to-two sentence description for a task titled ` +
    `"${title}". Plain text only, no markdown, no surrounding quotes.`;
  const traceId = randomUUID();
  const started = Date.now();

  try {
    const { text, usage } = await generateText({ model: MODEL, prompt });
    const description = text.trim();

    const posthog = getPostHogServerClient();
    if (posthog) {
      void posthog.captureImmediate({
        distinctId: guard.user.id,
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_model: MODEL.split("/")[1],
          $ai_provider: MODEL.split("/")[0],
          $ai_input: [{ role: "user", content: prompt }],
          $ai_input_tokens: usage.inputTokens ?? 0,
          $ai_output_choices: [{ role: "assistant", content: description }],
          $ai_output_tokens: usage.outputTokens ?? 0,
          $ai_latency: (Date.now() - started) / 1000,
        },
      });
    }

    return NextResponse.json({ description });
  } catch (error) {
    const posthog = getPostHogServerClient();
    if (posthog) {
      void posthog.captureImmediate({
        distinctId: guard.user.id,
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_model: MODEL.split("/")[1],
          $ai_provider: MODEL.split("/")[0],
          $ai_input: [{ role: "user", content: prompt }],
          $ai_latency: (Date.now() - started) / 1000,
          $ai_is_error: true,
          $ai_error: error instanceof Error ? error.message : String(error),
        },
      });
    }
    console.error("[ai] suggest-description failed:", error);
    return NextResponse.json(
      { error: "Could not generate a suggestion. Try writing one yourself." },
      { status: 502 }
    );
  }
}

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { requireMember } from "@/lib/auth";
import { formatZodError, suggestTaskDescriptionSchema } from "@/lib/validation";
import { getPostHogServerClient } from "@/lib/posthog-server";

/**
 * TaskFlow's one real LLM call: draft a short description from a task title.
 * Through Ollama's cloud API rather than Vercel's AI Gateway — the Gateway
 * needs a credit card on file before it'll serve even free-tier requests,
 * which this account doesn't have yet. Ollama's cloud API is OpenAI-
 * compatible, so the official @ai-sdk/openai-compatible provider talks to it
 * directly. Every call is captured as a $ai_generation event — this is the
 * thing PostHog's LLM analytics actually has something to watch.
 */
const PROVIDER = "ollama";
const MODEL_ID = "gpt-oss:20b-cloud";

const ollama = createOpenAICompatible({
  name: PROVIDER,
  baseURL: "https://ollama.com/v1",
  apiKey: process.env.OLLAMA_API_KEY,
});

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
    const { text, usage } = await generateText({
      model: ollama.chatModel(MODEL_ID),
      prompt,
    });
    const description = text.trim();

    const posthog = getPostHogServerClient();
    if (posthog) {
      // Awaited, not fire-and-forget: a serverless function can freeze the
      // instant its response is sent, which cuts off anything still in
      // flight. captureImmediate's whole point is to resolve only once the
      // event has actually been sent — so this has to be on the critical
      // path, not a void call racing the return below.
      await posthog.captureImmediate({
        distinctId: guard.user.id,
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_model: MODEL_ID,
          $ai_provider: PROVIDER,
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
      await posthog.captureImmediate({
        distinctId: guard.user.id,
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_model: MODEL_ID,
          $ai_provider: PROVIDER,
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

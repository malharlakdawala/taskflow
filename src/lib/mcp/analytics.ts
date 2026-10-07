import "server-only";

import type { AppUser } from "@/lib/auth";
import { getPostHogServerClient } from "@/lib/posthog-server";

const SERVER_NAME = "taskflow";
const SERVER_VERSION = "1.0.0";

/** Keeps a logged argument or result from growing without bound — this is
 * telemetry, not a record of the call, so a truncated tail is fine. */
const MAX_LOGGED_CHARS = 2000;

/** The value as-is when it's small; a truncated JSON string when it isn't.
 * Either way this is telemetry, never parsed back — a truncated tail is fine. */
function sanitize(value: unknown): unknown {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined || text.length <= MAX_LOGGED_CHARS) return value;
  return text.slice(0, MAX_LOGGED_CHARS) + "…(truncated)";
}

interface ClientInfo {
  name?: string;
  version?: string;
}

/**
 * Every capture here is awaited by its caller, not fire-and-forget: a
 * serverless function can freeze the instant its response is sent, which
 * would cut off a void captureImmediate() call before it actually reached
 * PostHog. captureImmediate's whole point is to resolve only once the event
 * has been sent, so it has to stay on the critical path.
 */

export async function captureMcpInitialize(
  actor: AppUser,
  clientInfo: ClientInfo | undefined,
  protocolVersion: string
) {
  const client = getPostHogServerClient();
  if (!client) return;
  await client.captureImmediate({
    distinctId: actor.id,
    event: "$mcp_initialize",
    properties: {
      $mcp_client_name: clientInfo?.name ?? "unknown",
      $mcp_client_version: clientInfo?.version ?? "unknown",
      $mcp_server_name: SERVER_NAME,
      $mcp_server_version: SERVER_VERSION,
      $mcp_protocol_version: protocolVersion,
    },
  });
}

export async function captureMcpToolsList(
  actor: AppUser,
  toolNames: string[],
  durationMs: number
) {
  const client = getPostHogServerClient();
  if (!client) return;
  await client.captureImmediate({
    distinctId: actor.id,
    event: "$mcp_tools_list",
    properties: {
      $mcp_server_name: SERVER_NAME,
      $mcp_server_version: SERVER_VERSION,
      $mcp_listed_tool_names: toolNames,
      $mcp_duration_ms: durationMs,
    },
  });
}

export async function captureMcpToolCall(
  actor: AppUser,
  params: {
    toolName: string;
    toolDescription: string;
    args: unknown;
    durationMs: number;
    isError: boolean;
    result?: unknown;
    errorType?: string;
    errorMessage?: string;
  }
) {
  const client = getPostHogServerClient();
  if (!client) return;
  await client.captureImmediate({
    distinctId: actor.id,
    event: "$mcp_tool_call",
    properties: {
      $mcp_server_name: SERVER_NAME,
      $mcp_server_version: SERVER_VERSION,
      $mcp_tool_name: params.toolName,
      $mcp_tool_description: params.toolDescription,
      $mcp_parameters: sanitize(params.args),
      $mcp_response: params.isError ? undefined : sanitize(params.result),
      $mcp_duration_ms: params.durationMs,
      $mcp_is_error: params.isError,
      ...(params.isError && {
        $mcp_error_type: params.errorType ?? "ToolError",
        $mcp_error_message: params.errorMessage,
      }),
    },
  });
}

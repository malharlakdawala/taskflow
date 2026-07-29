import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppUser } from "@/lib/auth";
import { bearerToken, userForToken } from "@/lib/mcp/tokens";
import { McpToolError, TOOLS, TOOLS_BY_NAME } from "@/lib/mcp/tools";

/**
 * TaskFlow as a remote MCP server.
 *
 * Speaks the Streamable HTTP transport's JSON mode: one JSON-RPC request per
 * POST, one JSON-RPC response back. There is no SSE stream and no session id,
 * because nothing here is long-running or stateful — every call is a database
 * round-trip authorised by the bearer token on the request. That makes the
 * endpoint a plain serverless function with no connection to keep alive.
 *
 * The protocol is implemented directly rather than through the SDK's
 * StreamableHTTPServerTransport: that transport is written against Node's
 * IncomingMessage/ServerResponse, and a route handler is handed a Web Request.
 * The surface actually needed — initialize, tools/list, tools/call, ping — is
 * small enough that adapting the streams costs more than writing it out.
 */

export const dynamic = "force-dynamic";
/** A tool call is a database round-trip, not a long-running job. */
export const maxDuration = 60;

const SERVER_INFO = {
  name: "taskflow",
  title: "TaskFlow",
  version: "1.0.0",
};

/**
 * Newest first. A client that asks for something we know is answered in that
 * version; anything else is answered in our newest and the client decides
 * whether it can live with it.
 */
const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];
const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/* JSON-RPC 2.0 error codes. */
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

type Id = string | number | null;

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  // Absent on notifications, which expect no reply at all.
  id: z.union([z.string(), z.number()]).nullish(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

type RpcRequest = z.infer<typeof requestSchema>;

const result = (id: Id, payload: unknown) =>
  NextResponse.json({ jsonrpc: "2.0", id, result: payload });

const rpcError = (id: Id, code: number, message: string, status = 200) =>
  NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status }
  );

/**
 * A tool that failed is not a protocol failure — the model needs to read the
 * reason and try something else, which only works if the call itself succeeds.
 */
const toolResult = (id: Id, payload: unknown) =>
  result(id, {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  });

const toolFailure = (id: Id, message: string) =>
  result(id, {
    content: [{ type: "text", text: message }],
    isError: true,
  });

/**
 * MCP clients discover servers by probing, and a 404 or an HTML error page is
 * indistinguishable from a typo'd URL. GET says plainly that this endpoint is
 * POST-only rather than that it does not exist.
 */
export async function GET() {
  return NextResponse.json(
    {
      error:
        "This is an MCP endpoint. POST JSON-RPC to it with an " +
        "Authorization: Bearer <token> header. Create a token under " +
        "Settings → MCP.",
    },
    { status: 405, headers: { Allow: "POST" } }
  );
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    // The WWW-Authenticate header is what lets a client tell "you forgot the
    // token" apart from "the server is broken".
    return NextResponse.json(
      { error: "Missing bearer token. Create one under Settings → MCP." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const actor = await userForToken(token);
  if (!actor) {
    return NextResponse.json(
      { error: "That token is not valid, or the account is not approved." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return rpcError(null, PARSE_ERROR, "Request body is not valid JSON", 400);
  }

  // Batches are part of JSON-RPC but no MCP client sends them for this
  // handful of methods, so the single-message path is the only one kept.
  if (Array.isArray(body)) {
    return rpcError(null, INVALID_REQUEST, "Batched requests are not supported", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return rpcError(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 request", 400);
  }

  return dispatch(parsed.data, actor);
}

async function dispatch(message: RpcRequest, actor: AppUser) {
  const id = message.id ?? null;
  const isNotification = message.id === undefined || message.id === null;

  // Notifications get no body by definition. `initialized` is the only one a
  // client sends here, and it wants an acknowledgement, not an answer.
  if (isNotification) {
    return new Response(null, { status: 202 });
  }

  switch (message.method) {
    case "initialize": {
      const asked = message.params?.protocolVersion;
      const version =
        typeof asked === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : LATEST_PROTOCOL_VERSION;

      return result(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `You are connected to TaskFlow as ${actor.email}. Tasks you create ` +
          `are created by you, and comments are posted as you. Assignments and ` +
          `comments notify the people involved, exactly as they would from the ` +
          `web app — so treat writes as visible to the team, not as drafts.`,
      });
    }

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });

    case "tools/call":
      return callTool(id, message, actor);

    // Advertised as unsupported in `capabilities`, but clients probe anyway
    // and an empty list is friendlier than an error.
    case "resources/list":
      return result(id, { resources: [] });
    case "prompts/list":
      return result(id, { prompts: [] });

    default:
      return rpcError(id, METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
  }
}

async function callTool(id: Id, message: RpcRequest, actor: AppUser) {
  const name = message.params?.name;
  if (typeof name !== "string") {
    return rpcError(id, INVALID_PARAMS, "tools/call needs a tool name");
  }

  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return rpcError(id, METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }

  const args = tool.schema.safeParse(message.params?.arguments ?? {});
  if (!args.success) {
    // Returned as a tool error rather than a protocol error: the model wrote
    // these arguments and is the one that can correct them.
    const detail = args.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    return toolFailure(id, `Invalid arguments for ${name} — ${detail}`);
  }

  try {
    return toolResult(id, await tool.run(args.data, actor));
  } catch (error) {
    if (error instanceof McpToolError) {
      return toolFailure(id, error.message);
    }
    // An unexpected failure is ours, not the model's. Log it in full and hand
    // back something that doesn't leak internals into a context window.
    console.error(`[mcp] ${name} failed for ${actor.email}:`, error);
    return rpcError(id, INTERNAL_ERROR, `${name} failed. Try again.`);
  }
}

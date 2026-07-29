"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Terminal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

/**
 * Settings → MCP.
 *
 * Members connect their own terminal to TaskFlow here. The alternative — the
 * stdio server in mcp-server/ — needs DATABASE_URL, which reaches every table
 * in the project including another application's. Handing that to everyone to
 * save building this would be trading the whole database for an afternoon.
 *
 * A token authorises the hosted endpoint to act as one member, and nothing
 * more: the same permissions, validation and notifications as the web app.
 */

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Only ever set right after creation — the server cannot reissue it. */
interface FreshToken extends TokenRow {
  token: string;
}

const PLACEHOLDER = "tf_live_yourtokenhere";

/**
 * The endpoint URL has to come from the browser — this is a client component
 * with no access to the request, and hardcoding the deployment would print the
 * wrong command when running locally.
 *
 * Read through useSyncExternalStore rather than an effect: the server has no
 * origin to render, and this is the supported way to say "the server sees
 * nothing here, the client sees this" without a hydration mismatch or a
 * cascading re-render.
 */
const subscribeToNothing = () => () => {};
const readEndpoint = () => `${window.location.origin}/api/mcp`;
const serverEndpoint = () => "";

export function McpConnection({ userEmail }: { userEmail: string }) {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [fresh, setFresh] = useState<FreshToken | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<TokenRow | null>(null);

  const endpoint = useSyncExternalStore(
    subscribeToNothing,
    readEndpoint,
    serverEndpoint
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/tokens")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load tokens");
        return response.json() as Promise<TokenRow[]>;
      })
      .then((data) => {
        if (!cancelled) setTokens(data);
      })
      .catch((error) => {
        console.error("Failed to load tokens:", error);
        if (!cancelled) notify.error("Could not load your tokens");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsCreating(true);
    try {
      const response = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not create token");

      const created = body as FreshToken;
      setTokens((prev) => [created, ...prev]);
      setFresh(created);
      setIsNaming(false);
      setName("");
    } catch (error) {
      notify.error(
        "Could not create token",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsCreating(false);
    }
  };

  const revoke = async (target: TokenRow) => {
    const before = tokens;
    setTokens((prev) => prev.filter((token) => token.id !== target.id));
    if (fresh?.id === target.id) setFresh(null);

    try {
      const response = await fetch(`/api/tokens/${target.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Revoke failed");
      notify.success("Token revoked", `"${target.name}" can no longer connect.`);
    } catch {
      setTokens(before);
      notify.error("Could not revoke that token");
    }
  };

  // Once the plaintext is gone the commands can only show a placeholder, so
  // the whole point of this screen is to be useful in the moment right after
  // a token is generated.
  const secret = fresh?.token ?? PLACEHOLDER;

  const snippets = useMemo(
    () => ({
      claudeCode: `claude mcp add --transport http taskflow ${endpoint} \\\n  --header "Authorization: Bearer ${secret}"`,
      json: JSON.stringify(
        {
          mcpServers: {
            taskflow: {
              type: "http",
              url: endpoint,
              headers: { Authorization: `Bearer ${secret}` },
            },
          },
        },
        null,
        2
      ),
      curl: `curl -s ${endpoint} \\\n  -H "Authorization: Bearer ${secret}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    }),
    [endpoint, secret]
  );

  return (
    <div className="space-y-6">
      <Card>
        {/* CardHeader is a grid; CardAction is the slot that keeps the button
            beside the title instead of stretched underneath it. */}
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Your tokens
          </CardTitle>
          <CardDescription>
            A token lets a terminal act as you — {userEmail}. Anything it does
            shows up as yours.
          </CardDescription>
          <CardAction>
            <Button size="sm" className="gap-1.5" onClick={() => setIsNaming(true)}>
              <Plus className="h-4 w-4" />
              New token
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Terminal className="h-4 w-4 text-muted-foreground" />
              </span>
              <p className="text-sm font-medium">No tokens yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Create one to connect Claude Code, Cursor or any other MCP
                client to this workspace.
              </p>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{token.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <code className="font-mono">{token.prefix}…</code>
                      {" · created "}
                      {new Date(token.createdAt).toLocaleDateString()}
                      {" · "}
                      {token.lastUsedAt
                        ? `last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                        : "never used"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Revoke ${token.name}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setPendingRevoke(token)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            Connect a client
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {fresh ? (
              <>
                These commands already contain the token you just created. It
                is not shown again after you leave this page.
              </>
            ) : (
              <>
                Replace{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {PLACEHOLDER}
                </code>{" "}
                with a token. Existing tokens can&rsquo;t be read back — create
                a new one if you no longer have it.
              </>
            )}
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude-code">
            <TabsList>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="json">Cursor / other</TabsTrigger>
              <TabsTrigger value="curl">Test it</TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="pt-3">
              <Snippet text={snippets.claudeCode} />
              <p className="mt-2 text-xs text-muted-foreground">
                Then ask it something like &ldquo;what&rsquo;s on my plate in
                TaskFlow?&rdquo;
              </p>
            </TabsContent>

            <TabsContent value="json" className="pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Cursor reads <code className="font-mono">~/.cursor/mcp.json</code>
                ; most other clients take the same shape.
              </p>
              <Snippet text={snippets.json} />
            </TabsContent>

            <TabsContent value="curl" className="pt-3">
              <p className="mb-2 text-xs text-muted-foreground">
                Lists the available tools. A wall of JSON means it works.
              </p>
              <Snippet text={snippets.curl} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            What a token can do
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            It reads and writes tasks and comments as you, with the same
            permissions you have in the app. Assignments and comments made from
            a terminal notify people exactly as they would from the board.
          </p>
          <p>
            It cannot read anyone else&rsquo;s notifications, manage members, or
            reach anything outside TaskFlow. Revoking a token cuts it off
            immediately.
          </p>
        </CardContent>
      </Card>

      <Dialog open={isNaming} onOpenChange={setIsNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New MCP token</DialogTitle>
            <DialogDescription>
              Name it after the machine or tool you&rsquo;ll use it from, so you
              know which one to revoke later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              autoFocus
              value={name}
              placeholder="MacBook — Claude Code"
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) void create();
              }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setIsNaming(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim() || isCreating} onClick={create}>
              {isCreating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create token
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={fresh !== null}
        onOpenChange={(open) => {
          // Closing is the point of no return, so it is the moment to say so
          // rather than burying the warning in the body text.
          if (!open) setFresh(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your token now</DialogTitle>
            <DialogDescription>
              This is the only time it will be shown. TaskFlow stores a hash, so
              it cannot be recovered — if you lose it, revoke it and make
              another.
            </DialogDescription>
          </DialogHeader>
          <Snippet text={fresh?.token ?? ""} />
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRevoke !== null}
        onOpenChange={(open) => !open && setPendingRevoke(null)}
        title="Revoke this token?"
        description={
          pendingRevoke
            ? `"${pendingRevoke.name}" will stop working immediately. Anything already created with it stays.`
            : undefined
        }
        confirmLabel="Revoke"
        destructive
        onConfirm={async () => {
          if (pendingRevoke) await revoke(pendingRevoke);
          setPendingRevoke(null);
        }}
      />
    </div>
  );
}

/** A copyable block. The copy button is the point; the text is long. */
function Snippet({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error("Could not copy", "Select the text and copy it manually.");
    }
  };

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3 pr-12 text-xs leading-relaxed">
        <code className="font-mono">{text}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        onClick={copy}
        className={cn(
          "absolute right-1.5 top-1.5 bg-background/80",
          copied && "text-green-600 dark:text-green-400"
        )}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

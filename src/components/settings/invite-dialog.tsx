"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, Loader2, MailX, TriangleAlert, UserCheck } from "lucide-react";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { InviteResult, UserRole } from "@/lib/types";

/**
 * Settings → Members → Invite people.
 *
 * One textarea rather than a row of email fields: onboarding a team is a paste
 * from somewhere else, and splitting on commas, spaces and newlines makes every
 * form that paste might have arrived in work.
 *
 * The result panel is not a formality. Each address can land somewhere
 * different — invited, re-invited, or already had an account and was simply let
 * in — and when the deployment cannot send email the link itself is the
 * deliverable, so it has to be visible and copyable.
 */

const ROLE_ITEMS: Record<UserRole, string> = {
  MEMBER: "Member",
  ADMIN: "Admin",
};

const MAX_AT_ONCE = 20;

/** Commas, semicolons, whitespace — however the list arrived. */
const splitAddresses = (value: string): string[] =>
  value
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export function InviteDialog({
  open,
  onOpenChange,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once the request lands, so the caller can reload its lists. */
  onSent: () => void;
}) {
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<UserRole>("MEMBER");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const addresses = splitAddresses(raw);

  const close = () => {
    onOpenChange(false);
    // Reset only on the way out, so the results stay readable until then.
    setRaw("");
    setRole("MEMBER");
    setResults(null);
    setError(null);
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (addresses.length === 0) return;

    if (addresses.length > MAX_AT_ONCE) {
      setError(`${MAX_AT_ONCE} addresses at a time is the limit.`);
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: addresses, role }),
      });
      const body = await response.json();

      if (!response.ok) {
        // A malformed address is the likely mistake, and it belongs on the
        // field rather than in a toast that vanishes.
        const detail = body?.details?.emails?.[0] ?? body?.error;
        setError(detail ?? "Could not send the invitations");
        return;
      }

      setResults(body.results as InviteResult[]);
      onSent();

      const invited = (body.results as InviteResult[]).filter(
        (result) => result.outcome === "invited" || result.outcome === "resent"
      ).length;
      const added = (body.results as InviteResult[]).filter(
        (result) => result.outcome === "added"
      ).length;

      if (invited > 0 || added > 0) {
        notify.success(
          [
            invited > 0 && `${invited} invited`,
            added > 0 && `${added} added`,
          ]
            .filter(Boolean)
            .join(", ")
        );
      }
    } catch (sending) {
      setError(
        sending instanceof Error ? sending.message : "Could not send"
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {results ? "Invitations sent" : "Invite people"}
          </DialogTitle>
          <DialogDescription>
            {results
              ? "Anyone invited gets a link that lets them straight in — no approval step."
              : "They get a link by email and join without waiting for approval. Someone who already signed up is let in instead."}
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <>
            <ul className="divide-y rounded-lg border">
              {results.map((result) => (
                <ResultRow key={result.email} result={result} />
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={close}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={send} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-emails">Email addresses</Label>
              <Textarea
                id="invite-emails"
                autoFocus
                rows={3}
                placeholder={"arpit@coldocean.io, ada@example.com"}
                value={raw}
                onChange={(event) => {
                  setRaw(event.target.value);
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
              />
              <p className="text-xs text-muted-foreground">
                {addresses.length > 0
                  ? `${addresses.length} address${addresses.length === 1 ? "" : "es"}`
                  : "Separate several with commas, spaces or new lines."}
              </p>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-role">Join as</Label>
              <Select
                items={ROLE_ITEMS}
                value={role}
                onValueChange={(next) => next && setRole(next as UserRole)}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === "ADMIN"
                  ? "Admins can invite, approve and remove members."
                  : "Members can see and edit every task in the workspace."}
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={addresses.length === 0 || isSending}>
                {isSending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {addresses.length > 1
                  ? `Send ${addresses.length} invitations`
                  : "Send invitation"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({ result }: { result: InviteResult }) {
  const { email, outcome, inviteUrl, emailed, error } = result;

  const label = {
    invited: "Invitation sent",
    resent: "Invitation resent",
    added: "Added to the workspace",
    "already-member": "Already a member",
    failed: error ?? "Could not invite",
  }[outcome];

  const muted = outcome === "already-member";
  const failed = outcome === "failed";

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          failed ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          !failed && !muted && "bg-primary/10 text-primary"
        )}
      >
        {failed ? (
          <TriangleAlert className="h-3.5 w-3.5" />
        ) : outcome === "added" ? (
          <UserCheck className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{email}</p>
        <p
          className={cn(
            "text-xs",
            failed ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {label}
        </p>

        {/* The link is the fallback whenever the mail did not go out, and it is
            only ever available here — the server keeps a hash of it. */}
        {inviteUrl && emailed === false && (
          <div className="mt-2 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
              <MailX className="h-3.5 w-3.5" />
              No email was sent. Pass this link on yourself.
            </p>
            <CopyLink url={inviteUrl} />
          </div>
        )}
        {inviteUrl && emailed !== false && (
          <div className="mt-2">
            <CopyLink url={inviteUrl} />
          </div>
        )}
      </div>
    </li>
  );
}

/** Shown once. Reissuing the invitation is the only way to get it back. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-1 font-mono text-[11px]">
        {url}
      </code>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={copied ? "Copied" : "Copy invite link"}
        className={cn(copied && "text-green-600 dark:text-green-400")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            notify.error("Could not copy", "Select the link and copy it manually.");
          }
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectBadge } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import type { VaultEntry } from "@/lib/types";

/**
 * The "mini window" a vault entry opens into on click. Two deliberate steps
 * to read a password: open this dialog, then click the masked password row
 * inside it — the list itself never shows or fetches a secret at all.
 */
export function VaultEntryDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: VaultEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const reveal = async () => {
    if (!entry || revealed !== null || isRevealing) return;
    setIsRevealing(true);
    try {
      const response = await fetch(`/api/vault/${entry.id}/reveal`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not reveal password");
      setRevealed(body.password ?? "");
    } catch (error) {
      notify.error(
        "Could not reveal password",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsRevealing(false);
    }
  };

  const copyPassword = async () => {
    if (revealed === null) return;
    try {
      await navigator.clipboard.writeText(revealed);
      notify.success("Password copied");
    } catch {
      notify.error("Could not copy — your browser blocked clipboard access");
    }
  };

  if (!entry) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // The next open of this same entry should ask again, not show what
        // was already fetched for a previous look.
        if (!next) {
          setRevealed(null);
          setIsRevealing(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {entry.name}
            {entry.project && <ProjectBadge project={entry.project} />}
          </DialogTitle>
          {entry.url && (
            <DialogDescription>
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary hover:underline"
              >
                {entry.url}
              </a>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid gap-2 text-sm">
          {entry.username && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">Username</span>
              <span className="font-mono text-xs">{entry.username}</span>
            </div>
          )}

          {entry.hasPassword && (
            <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <span className="text-xs text-muted-foreground">Password</span>
              {isRevealing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : revealed !== null ? (
                <span className="flex items-center gap-2 font-mono text-xs">
                  {revealed}
                  <button
                    type="button"
                    aria-label="Copy password"
                    onClick={copyPassword}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={reveal}
                  className="font-mono text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  •••••••• · click to reveal
                </button>
              )}
            </div>
          )}

          {entry.notes && (
            <div className="rounded-lg border px-3 py-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-xs">{entry.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Copy, Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectBadge } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import { displayName } from "@/lib/utils";
import type { VaultEntry } from "@/lib/types";

/**
 * One credential card — shared by the per-project vault page and the
 * workspace-wide one. Revealed plaintext lives in this component's own state,
 * not the parent's: keying the row on `updatedAt` (below) remounts it after
 * an edit, which is what clears a stale reveal for free, the same trick
 * CreateTaskDialog and ProjectDialog use for their own remount-on-open.
 */
export function VaultEntryRow({
  entry,
  showProject = false,
  onEdit,
  onDelete,
}: {
  entry: VaultEntry;
  /** Show which project this credential belongs to — the workspace-wide view needs this; a single project's own page doesn't. */
  showProject?: boolean;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const toggleReveal = async () => {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    if (!entry.hasPassword) return;

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

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{entry.name}</h3>
            {showProject && entry.project && <ProjectBadge project={entry.project} />}
            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-xs text-muted-foreground hover:text-primary hover:underline"
              >
                {entry.url}
              </a>
            )}
          </div>

          <div className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            {entry.username && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">User:</span>
                <span className="font-mono text-xs">{entry.username}</span>
              </div>
            )}
            {entry.hasPassword && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Pass:</span>
                <span className="font-mono text-xs">
                  {revealed !== null ? revealed : "••••••••"}
                </span>
                <button
                  type="button"
                  aria-label={revealed !== null ? "Hide password" : "Reveal password"}
                  onClick={toggleReveal}
                  disabled={isRevealing}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {isRevealing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : revealed !== null ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
                {revealed !== null && (
                  <button
                    type="button"
                    aria-label="Copy password"
                    onClick={copyPassword}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {entry.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
              {entry.notes}
            </p>
          )}

          <p className="mt-2 text-[11px] text-muted-foreground">
            Added by {entry.createdBy ? displayName(entry.createdBy) : "someone no longer here"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Edit ${entry.name}`}
            onClick={() => onEdit(entry)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${entry.name}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(entry)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

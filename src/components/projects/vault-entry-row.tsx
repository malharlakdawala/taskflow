"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectBadge } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import { displayName } from "@/lib/utils";
import type { VaultEntry } from "@/lib/types";

/** Shared by both vault pages' search bars — matches name, username, URL, notes, and (workspace view only) project name. */
export function matchesVaultQuery(entry: VaultEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.name, entry.username, entry.url, entry.notes, entry.project?.name].some(
    (field) => field?.toLowerCase().includes(q)
  );
}

/**
 * One credential card — shared by the per-project vault page and the
 * workspace-wide one. Revealed plaintext lives in this component's own state,
 * not the parent's: keying the row on `updatedAt` (below) remounts it after
 * an edit, which is what fetches a fresh reveal for free, the same trick
 * CreateTaskDialog and ProjectDialog use for their own remount-on-open.
 *
 * The password decrypts and shows as soon as the row mounts — no separate
 * reveal click. That trades a little more traffic (every visible entry's
 * secret is fetched on load) for one less step every time the vault is
 * actually opened to use a credential, which is the whole point of it.
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
  // Starts true exactly when there's something to fetch, so the effect below
  // never has to set it synchronously on entry — only ever from within the
  // async callbacks, once the request actually settles.
  const [isRevealing, setIsRevealing] = useState(entry.hasPassword);

  useEffect(() => {
    if (!entry.hasPassword) return;
    let cancelled = false;

    fetch(`/api/vault/${entry.id}/reveal`, { method: "POST" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Could not reveal password");
        if (!cancelled) setRevealed(body.password ?? "");
      })
      .catch((error) => {
        if (!cancelled) {
          notify.error(
            "Could not reveal password",
            error instanceof Error ? error.message : undefined
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsRevealing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.hasPassword]);

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
                {isRevealing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="font-mono text-xs">{revealed ?? "••••••••"}</span>
                )}
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

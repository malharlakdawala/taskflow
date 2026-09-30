"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectBadge } from "@/components/projects/project-badge";
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
 * One credential card in the list — shared by the per-project vault page and
 * the workspace-wide one. The password never appears here, not even masked
 * text with a reveal control: the row is a summary, and clicking it (outside
 * the edit/delete icons) is what opens VaultEntryDetailDialog, where the
 * password stays masked until it's clicked again, on purpose — opening the
 * vault and reading a password off the list are two deliberately separate
 * steps.
 */
export function VaultEntryRow({
  entry,
  showProject = false,
  onView,
  onEdit,
  onDelete,
}: {
  entry: VaultEntry;
  /** Show which project this credential belongs to — the workspace-wide view needs this; a single project's own page doesn't. */
  showProject?: boolean;
  onView: (entry: VaultEntry) => void;
  onEdit: (entry: VaultEntry) => void;
  onDelete: (entry: VaultEntry) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-card p-4">
      <button
        type="button"
        onClick={() => onView(entry)}
        className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-medium">{entry.name}</h3>
          {showProject && entry.project && <ProjectBadge project={entry.project} />}
          {entry.url && (
            <span className="truncate text-xs text-muted-foreground">{entry.url}</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          {entry.username && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">User:</span>
              <span className="font-mono text-xs">{entry.username}</span>
            </div>
          )}
          {entry.hasPassword && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Pass:</span>
              <span className="font-mono text-xs">••••••••</span>
            </div>
          )}
        </div>

        {entry.notes && (
          <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
            {entry.notes}
          </p>
        )}

        <p className="mt-2 text-[11px] text-muted-foreground">
          Added by {entry.createdBy ? displayName(entry.createdBy) : "someone no longer here"}
        </p>
      </button>

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
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { KeyRound, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VaultEntryDialog } from "@/components/projects/vault-entry-dialog";
import { VaultEntryDetailDialog } from "@/components/projects/vault-entry-detail-dialog";
import { VaultEntryRow, matchesVaultQuery } from "@/components/projects/vault-entry-row";
import { ProjectDot } from "@/components/projects/project-badge";
import { useProjects } from "@/lib/use-projects";
import { notify } from "@/lib/notify";
import type { VaultEntry } from "@/lib/types";

/**
 * Every credential across every project this member edits, in one place —
 * the per-project vault page is still there for a project-scoped view, this
 * is the shortcut that skips picking a project first. Grouped by project
 * rather than one flat list, since which project a credential is filed under
 * is exactly who else can see it.
 */
export default function VaultPage() {
  // A real PostHog feature flag, not a hardcoded default — toggle it off in
  // PostHog's dashboard and the search bar disappears for everyone, no
  // redeploy. Undefined while flags are still loading reads as "on": the
  // bar flashing in a moment after the page paints is a smaller cost than
  // the whole page waiting on a flags round-trip before rendering at all.
  const searchEnabled = useFeatureFlagEnabled("vault-search") !== false;
  const { projects, isLoading: projectsLoading } = useProjects();
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [deleting, setDeleting] = useState<VaultEntry | null>(null);
  const [viewing, setViewing] = useState<VaultEntry | null>(null);
  // Same remount-on-open trick as the per-project vault page and every other
  // dialog in this codebase — see that page's own note.
  const [dialogKey, setDialogKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/vault");
        if (!response.ok) throw new Error("Failed to load vault");
        const data: VaultEntry[] = await response.json();
        if (!cancelled) setEntries(data);
      } catch {
        if (!cancelled) notify.error("Could not load the vault");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const editableProjects = useMemo(
    () => projects.filter((project) => project.myRole === "EDITOR" && !project.archived),
    [projects]
  );

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesVaultQuery(entry, query)),
    [entries, query]
  );

  const groups = useMemo(() => {
    const byProject = new Map<string, VaultEntry[]>();
    for (const entry of filteredEntries) {
      const list = byProject.get(entry.projectId) ?? [];
      list.push(entry);
      byProject.set(entry.projectId, list);
    }
    return byProject;
  }, [filteredEntries]);

  const openCreate = () => {
    setEditing(null);
    setDialogKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const openEdit = (entry: VaultEntry) => {
    setEditing(entry);
    setDialogKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const handleSaved = (entry: VaultEntry) => {
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id);
      return exists ? prev.map((e) => (e.id === entry.id ? entry : e)) : [...prev, entry];
    });
  };

  const handleDelete = async (entry: VaultEntry) => {
    try {
      const response = await fetch(`/api/vault/${entry.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      notify.success(`${entry.name} deleted`);
    } catch {
      notify.error("Could not delete credential");
    }
  };

  const loading = isLoading || projectsLoading;

  return (
    <div className="enter flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight">Vault</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${entries.length} ${entries.length === 1 ? "credential" : "credentials"} across ${editableProjects.length} ${editableProjects.length === 1 ? "project" : "projects"} you edit`}
          </p>
        </div>
        {editableProjects.length > 0 && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add credential
          </Button>
        )}
      </header>

      {!loading && entries.length > 0 && searchEnabled && (
        <div className="border-b bg-card/40 px-6 py-3">
          <div className="relative mx-auto max-w-3xl">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username, URL, notes or project…"
              className="pl-8"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : editableProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No vault to show yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                You need editor access on a project before you can store or see
                its credentials.
              </p>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Nothing stored yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Logins, API keys, anything a project&rsquo;s editors need to
                share safely.
              </p>
            </div>
            <Button onClick={openCreate} className="mt-1 gap-2">
              <Plus className="h-4 w-4" />
              Add credential
            </Button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <Search className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No matches for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {editableProjects
              .filter((project) => groups.has(project.id))
              .map((project) => (
                <div key={project.id}>
                  <Link
                    href={`/projects/${project.id}/vault`}
                    className="group mb-2 flex items-center gap-2 text-sm font-medium hover:text-primary"
                  >
                    <ProjectDot color={project.color} />
                    {project.name}
                    <span className="text-xs text-muted-foreground group-hover:text-primary">
                      Open project vault →
                    </span>
                  </Link>
                  <div className="space-y-2">
                    {groups.get(project.id)!.map((entry) => (
                      <VaultEntryRow
                        key={`${entry.id}:${entry.updatedAt}`}
                        entry={entry}
                        onView={setViewing}
                        onEdit={openEdit}
                        onDelete={setDeleting}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <VaultEntryDialog
        key={dialogKey}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        entry={editing}
        onSaved={handleSaved}
      />

      <VaultEntryDetailDialog
        entry={viewing}
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description="This cannot be undone."
        confirmLabel="Delete credential"
        destructive
        onConfirm={async () => {
          if (deleting) await handleDelete(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

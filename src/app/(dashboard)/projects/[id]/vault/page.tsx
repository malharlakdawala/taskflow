"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FolderX, KeyRound, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { VaultEntryDialog } from "@/components/projects/vault-entry-dialog";
import { VaultEntryRow, matchesVaultQuery } from "@/components/projects/vault-entry-row";
import { ProjectDot } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import type { Project, VaultEntry } from "@/lib/types";

export default function ProjectVaultPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntry | null>(null);
  const [deleting, setDeleting] = useState<VaultEntry | null>(null);
  // Bumped on every open so VaultEntryDialog remounts with fresh fields —
  // same reason CreateTaskDialog and ProjectDialog do this rather than
  // re-syncing state from props in an effect.
  const [dialogKey, setDialogKey] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [projectRes, entriesRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/projects/${projectId}/vault`),
        ]);
        if (!projectRes.ok || !entriesRes.ok) throw new Error("not found");

        const projectData: Project = await projectRes.json();
        const entriesData: VaultEntry[] = await entriesRes.json();

        if (!cancelled) {
          setProject(projectData);
          setEntries(entriesData);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (notFound) notify.error("Could not load that project's vault");
  }, [notFound]);

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

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesVaultQuery(entry, query)),
    [entries, query]
  );

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-64" />
        </div>
        <div className="flex-1 space-y-2 p-6">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FolderX className="h-5 w-5 text-muted-foreground" />
        </span>
        <h1 className="font-display text-lg font-semibold">Vault not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Either this project doesn&rsquo;t exist, or you need to be an editor
          on it to see its vault.
        </p>
        <Button variant="outline" className="mt-1" render={<Link href="/projects" />}>
          Back to projects
        </Button>
      </div>
    );
  }

  return (
    <div className="enter flex h-full flex-col">
      <header className="border-b bg-card/60 px-6 py-4 backdrop-blur">
        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link href="/projects" className="rounded px-1 py-0.5 hover:text-foreground">
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="flex items-center gap-1.5 text-foreground">
            <ProjectDot color={project.color} />
            {project.name}
          </span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back to projects"
              render={<Link href="/projects" />}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">
                {project.name} · Vault
              </h1>
              <p className="text-sm text-muted-foreground">
                {entries.length} {entries.length === 1 ? "credential" : "credentials"} ·
                visible only to this project&rsquo;s editors
              </p>
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Add credential
          </Button>
        </div>
      </header>

      {entries.length > 0 && (
        <div className="border-b bg-card/40 px-6 py-3">
          <div className="relative mx-auto max-w-3xl">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username, URL or notes…"
              className="pl-8"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <KeyRound className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">Nothing stored yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Logins, API keys, anything this project&rsquo;s editors need
                to share safely.
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
          <div className="mx-auto max-w-3xl space-y-2">
            {filteredEntries.map((entry) => (
              <VaultEntryRow
                key={`${entry.id}:${entry.updatedAt}`}
                entry={entry}
                onEdit={openEdit}
                onDelete={setDeleting}
              />
            ))}
          </div>
        )}
      </div>

      <VaultEntryDialog
        key={dialogKey}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        projectId={projectId}
        entry={editing}
        onSaved={handleSaved}
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Archive,
  ArchiveRestore,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { ProjectDot } from "@/components/projects/project-badge";
import { notify } from "@/lib/notify";
import { useProjects, invalidateProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  // Read through the shared cache rather than keeping a private copy, so the
  // sidebar and every open picker move in step with what happens here.
  const { projects, isLoading } = useProjects();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bumped on every open so ProjectDialog remounts with fresh fields — see the
  // note on that component about why it initialises once rather than resyncing.
  const [dialogKey, setDialogKey] = useState(0);

  const active = projects.filter((project) => !project.archived);
  const archived = projects.filter((project) => project.archived);

  const openCreate = () => {
    setEditing(null);
    setDialogKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setDialogKey((key) => key + 1);
    setIsDialogOpen(true);
  };

  const setArchived = async (project: Project, archive: boolean) => {
    setBusyId(project.id);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: archive }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Update failed");

      invalidateProjects();
      notify.success(
        archive ? `${project.name} archived` : `${project.name} restored`,
        archive ? "Its tasks are untouched." : undefined
      );
    } catch (error) {
      notify.error(
        "Could not update project",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (project: Project) => {
    setBusyId(project.id);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Delete failed");

      invalidateProjects();
      // The count comes from the route, which read it before deleting — saying
      // where the work went is the whole point of orphaning rather than cascading.
      const orphaned: number = body?.orphaned ?? 0;
      notify.success(
        `${project.name} deleted`,
        orphaned > 0
          ? `${orphaned} ${orphaned === 1 ? "task" : "tasks"} moved to No project.`
          : undefined
      );
    } catch (error) {
      notify.error(
        "Could not delete project",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  const ProjectRow = ({ project }: { project: Project }) => {
    const { taskCount, doneCount } = project;
    const percent = taskCount === 0 ? 0 : Math.round((doneCount / taskCount) * 100);
    const isBusy = busyId === project.id;

    return (
      <div
        data-project-color={project.color ?? "slate"}
        className={cn(
          "tone-rail flex flex-col rounded-xl border bg-card p-4 pl-5",
          project.archived && "opacity-70"
        )}
      >
        {/* Same colour spine the task cards wear, so a project reads as the
            thing its chips refer to. */}
        <span className="tone-rail-bar" aria-hidden />

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ProjectDot color={project.color} />
              {/* The name is the way into the work: a list filtered to it. */}
              <Link
                href={`/list?project=${project.id}`}
                className="truncate rounded hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {project.name}
              </Link>
            </h2>
            {project.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            )}
          </div>
          {project.archived && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              {taskCount === 0
                ? "No tasks yet"
                : `${doneCount} of ${taskCount} done`}
            </span>
            {taskCount > 0 && (
              <span className="font-medium tabular-nums">{percent}%</span>
            )}
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${project.name} progress`}
          >
            <div
              className="h-full rounded-full bg-[var(--tone)] transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => openEdit(project)}
          >
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isBusy}
            onClick={() => setArchived(project, !project.archived)}
          >
            {project.archived ? (
              <>
                <ArchiveRestore className="mr-1 h-3.5 w-3.5" />
                Restore
              </>
            ) : (
              <>
                <Archive className="mr-1 h-3.5 w-3.5" />
                Archive
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={isBusy}
            onClick={() => setDeleting(project)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {active.length} {active.length === 1 ? "project" : "projects"} ·
            group tasks into bodies of work
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center">
            <FolderPlus className="h-8 w-8 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No projects yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tasks work fine without one. A project helps once there are
                enough of them to lose track of.
              </p>
            </div>
            <Button onClick={openCreate} className="mt-1 gap-2">
              <Plus className="h-4 w-4" />
              New project
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {active.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((project) => (
                  <ProjectRow key={project.id} project={project} />
                ))}
              </div>
            )}

            {archived.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Archived
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {archived.map((project) => (
                    <ProjectRow key={project.id} project={project} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <ProjectDialog
        key={dialogKey}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        project={editing}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "project"}?`}
        description={
          deleting && deleting.taskCount > 0
            ? `Its ${deleting.taskCount} ${
                deleting.taskCount === 1 ? "task" : "tasks"
              } will move to No project — nothing is deleted with it. Archive instead if you only want it out of the way.`
            : "Nothing else is affected. Archive instead if you only want it out of the way."
        }
        confirmLabel="Delete project"
        destructive
        onConfirm={async () => {
          if (deleting) await handleDelete(deleting);
        }}
      />
    </div>
  );
}

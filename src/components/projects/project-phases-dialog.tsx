"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Check, Layers, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { notify } from "@/lib/notify";
import { invalidatePhases, usePhases } from "@/lib/use-phases";
import type { Phase, Project } from "@/lib/types";

interface ProjectPhasesDialogProps {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * The stages a project is split into. Everyone on the project can see them;
 * adding, renaming, reordering and removing is an EDITOR's job. Removing a
 * phase never removes work — its tasks stay in the project, unphased.
 */
export function ProjectPhasesDialog({ project, onOpenChange }: ProjectPhasesDialogProps) {
  const { phases, isLoading } = usePhases(project?.id ?? null);
  const [name, setName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  if (!project) return null;
  const canEdit = project.myRole === "EDITOR";
  const base = `/api/projects/${project.id}/phases`;

  const send = async (url: string, method: string, body?: unknown) => {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error ?? "Request failed");
    invalidatePhases(project.id);
    return payload;
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsAdding(true);
    try {
      await send(base, "POST", { name: trimmed });
      setName("");
    } catch (error) {
      notify.error("Could not add phase", error instanceof Error ? error.message : undefined);
    } finally {
      setIsAdding(false);
    }
  };

  const run = async (phase: Phase, action: () => Promise<unknown>, failure: string) => {
    setBusyId(phase.id);
    try {
      await action();
    } catch (error) {
      notify.error(failure, error instanceof Error ? error.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  const rename = (phase: Phase) =>
    run(
      phase,
      async () => {
        const trimmed = draft.trim();
        if (trimmed && trimmed !== phase.name) {
          await send(`${base}/${phase.id}`, "PATCH", { name: trimmed });
        }
        setEditingId(null);
      },
      "Could not rename phase"
    );

  /** Swaps order values with the neighbour, so the move is one step either way. */
  const move = (index: number, direction: -1 | 1) => {
    const phase = phases[index];
    const neighbour = phases[index + direction];
    if (!neighbour) return;
    return run(
      phase,
      async () => {
        // Equal orders (never expected) would make a swap a no-op; nudging
        // past the neighbour handles that case too.
        const target =
          phase.order === neighbour.order
            ? neighbour.order + direction
            : neighbour.order;
        await Promise.all([
          send(`${base}/${phase.id}`, "PATCH", { order: target }),
          send(`${base}/${neighbour.id}`, "PATCH", { order: phase.order }),
        ]);
      },
      "Could not reorder phases"
    );
  };

  const remove = (phase: Phase) =>
    run(
      phase,
      async () => {
        const result = await send(`${base}/${phase.id}`, "DELETE");
        if (result.unphased > 0) {
          notify.success(
            `${phase.name} removed`,
            `${result.unphased} ${result.unphased === 1 ? "task stays" : "tasks stay"} in ${project.name}, with no phase.`
          );
        }
      },
      "Could not remove phase"
    );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {project.name} phases
          </DialogTitle>
          <DialogDescription>
            Split a big project into stages. File tasks into a phase from the
            task itself, or ask the MCP to do it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </>
          ) : phases.length === 0 ? (
            <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              No phases yet.
            </p>
          ) : (
            phases.map((phase, index) => {
              const isBusy = busyId === phase.id;
              const percent = phase.taskCount
                ? Math.round((phase.doneCount / phase.taskCount) * 100)
                : 0;
              return (
                <div
                  key={phase.id}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2"
                >
                  <span className="w-5 shrink-0 text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  {editingId === phase.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        rename(phase);
                      }}
                    >
                      <Input
                        autoFocus
                        value={draft}
                        maxLength={120}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingId(null)}
                        className="h-8"
                      />
                      <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save name" disabled={isBusy}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setEditingId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/list?project=${project.id}&phase=${phase.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {phase.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {phase.taskCount} {phase.taskCount === 1 ? "task" : "tasks"}
                        {phase.taskCount > 0 && ` · ${percent}% done`}
                      </p>
                    </div>
                  )}

                  {canEdit && editingId !== phase.id && (
                    <div className="flex shrink-0 items-center">
                      {isBusy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={isBusy || index === 0} onClick={() => move(index, -1)}>
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={isBusy || index === phases.length - 1} onClick={() => move(index, 1)}>
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Rename"
                        disabled={isBusy}
                        onClick={() => {
                          setDraft(phase.name);
                          setEditingId(phase.id);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove phase"
                        className="text-destructive hover:text-destructive"
                        disabled={isBusy}
                        onClick={() => remove(phase)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {canEdit && (
          <form onSubmit={handleAdd} className="flex items-center gap-2 border-t pt-4">
            <Input
              value={name}
              maxLength={120}
              placeholder="e.g. Phase 1: Onboarding agent"
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={isAdding || !name.trim()} className="shrink-0 gap-1">
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add phase
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

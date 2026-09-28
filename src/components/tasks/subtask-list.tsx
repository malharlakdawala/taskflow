"use client";

import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserChip } from "@/components/tasks/user-chip";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { Subtask } from "@/lib/types";
import { Loader2, Plus, X } from "lucide-react";

interface SubtaskListProps {
  parentId: string;
  subtasks: Subtask[];
  /** False when this task is itself a subtask — nesting is one level deep. */
  canAdd: boolean;
  onAdded: (subtask: Subtask) => void;
  onChanged: (subtask: Subtask) => void;
  onRemoved: (subtaskId: string) => void;
}

export function SubtaskList({
  parentId,
  subtasks,
  canAdd,
  onAdded,
  onChanged,
  onRemoved,
}: SubtaskListProps) {
  const [title, setTitle] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  /** Which row has a request in flight, so a double-click can't fire twice. */
  const [pending, setPending] = useState<Set<string>>(new Set());

  const withPending = async (id: string, run: () => Promise<void>) => {
    setPending((prev) => new Set(prev).add(id));
    try {
      await run();
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleToggle = (subtask: Subtask, checked: boolean) =>
    withPending(subtask.id, async () => {
      try {
        const response = await fetch(`/api/tasks/${subtask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: checked ? "DONE" : "TODO" }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Update failed");
        onChanged({ ...subtask, status: body.status });
      } catch (error) {
        notify.error(
          "Could not update subtask",
          error instanceof Error ? error.message : undefined
        );
      }
    });

  const handleRemove = (subtask: Subtask) =>
    withPending(subtask.id, async () => {
      try {
        const response = await fetch(`/api/tasks/${subtask.id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("Delete failed");
        onRemoved(subtask.id);
      } catch {
        notify.error("Could not remove subtask");
      }
    });

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, parentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not add subtask");
      onAdded({
        id: body.id,
        title: body.title,
        status: body.status,
        priority: body.priority,
        assigneeId: body.assigneeId,
        assignee: body.assignee,
        dueDate: body.dueDate,
        createdAt: body.createdAt,
      });
      setTitle("");
    } catch (error) {
      notify.error(
        "Could not add subtask",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      {subtasks.length > 0 && (
        <ul className="space-y-1.5">
          {subtasks.map((subtask) => {
            const isDone = subtask.status === "DONE";
            const isPending = pending.has(subtask.id);

            return (
              <li
                key={subtask.id}
                className="group flex items-center gap-2.5 rounded-lg border bg-card/50 px-2.5 py-2"
              >
                <Checkbox
                  checked={isDone}
                  disabled={isPending}
                  onCheckedChange={(checked) =>
                    handleToggle(subtask, checked === true)
                  }
                  aria-label={`Mark "${subtask.title}" as ${isDone ? "not done" : "done"}`}
                />
                <Link
                  href={`/tasks/${subtask.id}`}
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm transition-colors hover:text-primary",
                    isDone && "text-muted-foreground line-through decoration-1"
                  )}
                >
                  {subtask.title}
                </Link>
                {subtask.assignee && (
                  <UserChip user={subtask.assignee} className="shrink-0" />
                )}
                <button
                  type="button"
                  aria-label={`Remove "${subtask.title}"`}
                  disabled={isPending}
                  onClick={() => handleRemove(subtask)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-destructive disabled:opacity-50"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {subtasks.length === 0 && !canAdd && (
        <p className="text-sm text-muted-foreground">No subtasks.</p>
      )}

      {canAdd && (
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a subtask…"
            disabled={isAdding}
            className="h-9"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={isAdding || !title.trim()}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

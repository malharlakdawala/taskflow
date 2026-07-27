"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ChevronDown,
  ListTodo,
  MessageSquare,
  Paperclip,
} from "lucide-react";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { StatusDot } from "@/components/tasks/status-badge";
import {
  StatusCell,
  PriorityCell,
  AssigneeCell,
  DueDateCell,
} from "@/components/tasks/inline-fields";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus } from "@/lib/types";
import { STATUS_ITEMS } from "@/lib/types";

/** Active work first, finished work last — the order you actually scan in. */
const GROUPS: TaskStatus[] = [
  "IN_PROGRESS",
  "IN_REVIEW",
  "TODO",
  "BACKLOG",
  "DONE",
];

/** Column widths shared by the header strip and every row. */
const GRID =
  "grid grid-cols-[36px_minmax(0,1fr)_150px_140px_180px_120px] items-center gap-3";

export default function ListPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createIn, setCreateIn] = useState<TaskStatus | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");
        const data: Task[] = await response.json();
        if (!cancelled) setTasks(data);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
        if (!cancelled) notify.error("Could not load tasks");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      GROUPS.map((s) => [s, [] as Task[]])
    ) as Record<TaskStatus, Task[]>;
    for (const task of tasks) map[task.status]?.push(task);
    for (const status of GROUPS) map[status].sort((a, b) => a.order - b.order);
    return map;
  }, [tasks]);

  /** Optimistic: the row changes instantly and reverts if the save fails. */
  const patch = useCallback(
    async (
      id: string,
      optimistic: Partial<Task>,
      payload: Record<string, unknown>
    ) => {
      const before = tasks;
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...optimistic } : t))
      );
      try {
        const response = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Update failed");
        setTasks((prev) => prev.map((t) => (t.id === id ? body : t)));
      } catch (error) {
        setTasks(before);
        notify.error(
          "Could not save",
          error instanceof Error ? error.message : undefined
        );
      }
    },
    [tasks]
  );

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (status: TaskStatus) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });

  const allSelected = tasks.length > 0 && selected.size === tasks.length;

  const openCreate = (status?: TaskStatus) => {
    setCreateIn(status);
    setIsCreateDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-10 w-1/3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="enter flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">List</h1>
          <p className="text-sm text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} · click a row to open it, or edit any field in place`}
          </p>
        </div>
        <Button onClick={() => openCreate()} className="gap-2">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5 pb-24">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-card py-20 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <ListTodo className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="font-display text-base font-semibold">No tasks yet</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Create your first task and it will show up here.
            </p>
            <Button size="sm" className="mt-2 gap-2" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              New task
            </Button>
          </div>
        ) : (
          <>
            <div
              className={cn(
                GRID,
                "px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              )}
            >
              <Checkbox
                checked={allSelected}
                indeterminate={selected.size > 0 && !allSelected}
                onCheckedChange={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(tasks.map((t) => t.id))
                  )
                }
                aria-label="Select all tasks"
              />
              <span>Task</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Assignee</span>
              <span>Due</span>
            </div>

            <div className="space-y-4">
              {GROUPS.map((status) => {
                const rows = grouped[status];
                const isCollapsed = collapsed.has(status);

                return (
                  <section
                    key={status}
                    data-status={status}
                    className="overflow-hidden rounded-xl border bg-card"
                  >
                    <header className="flex items-center gap-2 border-b bg-[var(--tone-soft)]/60 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => toggleGroup(status)}
                        aria-expanded={!isCollapsed}
                        className="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-background/60"
                      >
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
                            isCollapsed && "-rotate-90"
                          )}
                        />
                        <StatusDot status={status} />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--tone-ink)]">
                          {STATUS_ITEMS[status]}
                        </span>
                        <span className="tone-chip rounded-full px-1.5 text-[11px] font-bold tabular-nums">
                          {rows.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCreate(status)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add task
                      </button>
                    </header>

                    {!isCollapsed &&
                      (rows.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => openCreate(status)}
                          className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add a task to {STATUS_ITEMS[status]}
                        </button>
                      ) : (
                        <ul>
                          {rows.map((task) => {
                            const isSelected = selected.has(task.id);
                            return (
                              <li key={task.id}>
                                {/* The whole row navigates; each editable cell
                                    stops propagation so it works in place. */}
                                <div
                                  role="link"
                                  tabIndex={0}
                                  onClick={() => router.push(`/tasks/${task.id}`)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      router.push(`/tasks/${task.id}`);
                                    }
                                  }}
                                  className={cn(
                                    GRID,
                                    "group/row cursor-pointer border-b px-3 py-2 last:border-b-0",
                                    "transition-colors hover:bg-muted/50",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40",
                                    isSelected && "bg-primary/[0.06]"
                                  )}
                                >
                                  <div onClick={(e) => e.stopPropagation()}>
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => toggleOne(task.id)}
                                      aria-label={`Select ${task.title}`}
                                    />
                                  </div>

                                  <div className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={cn(
                                        "truncate font-medium",
                                        task.status === "DONE" &&
                                          "text-muted-foreground line-through decoration-1"
                                      )}
                                    >
                                      {task.title}
                                    </span>
                                    {task.commentCount > 0 && (
                                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                                        <MessageSquare className="h-3 w-3" />
                                        {task.commentCount}
                                      </span>
                                    )}
                                    {task.attachmentCount > 0 && (
                                      <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
                                        <Paperclip className="h-3 w-3" />
                                        {task.attachmentCount}
                                      </span>
                                    )}
                                  </div>

                                  <StatusCell
                                    status={task.status}
                                    onChange={(next) =>
                                      patch(task.id, { status: next }, { status: next })
                                    }
                                  />
                                  <PriorityCell
                                    priority={task.priority}
                                    onChange={(next) =>
                                      patch(task.id, { priority: next }, { priority: next })
                                    }
                                  />
                                  <AssigneeCell
                                    assignee={task.assignee}
                                    onChange={(assigneeId) =>
                                      patch(task.id, {}, { assigneeId })
                                    }
                                  />
                                  <DueDateCell
                                    task={task}
                                    onChange={(dueDate) =>
                                      patch(task.id, {}, { dueDate })
                                    }
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ))}
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <BulkActionBar
        selectedIds={[...selected]}
        onClear={() => setSelected(new Set())}
        onApplied={(ids, changes) =>
          setTasks((prev) =>
            prev.map((task) =>
              ids.includes(task.id) ? { ...task, ...changes } : task
            )
          )
        }
        onDeleted={(ids) => {
          setTasks((prev) => prev.filter((task) => !ids.includes(task.id)));
          setSelected(new Set());
        }}
      />

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        defaultStatus={createIn}
        onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
      />
    </div>
  );
}

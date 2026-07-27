"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowUpDown, ListTodo, Calendar, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { UserChip } from "@/components/tasks/user-chip";
import { StatusBadge, PriorityBadge } from "@/components/tasks/status-badge";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/types";

type SortField = "title" | "status" | "priority" | "dueDate" | "createdAt";

export default function ListPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedTasks = useMemo(() => {
    const copy = [...tasks];
    copy.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return copy;
  }, [tasks, sortField, sortDirection]);

  const allSelected = sortedTasks.length > 0 && selected.size === sortedTasks.length;
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sortedTasks.map((t) => t.id)));

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Applies a bulk change locally after the server confirms it. */
  const applyBulk = (ids: string[], changes: Partial<Task>) =>
    setTasks((prev) =>
      prev.map((task) =>
        ids.includes(task.id) ? { ...task, ...changes } : task
      )
    );

  const removeBulk = (ids: string[]) =>
    setTasks((prev) => prev.filter((task) => !ids.includes(task.id)));

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-1/3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">List</h1>
          <p className="text-sm text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} selected`
              : `${sortedTasks.length} ${sortedTasks.length === 1 ? "task" : "tasks"} · tick rows to edit in bulk`}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </header>

      <div className="flex-1 overflow-auto px-6 py-5 pb-24">
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[44px] pl-4">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all tasks"
                  />
                </TableHead>
                <TableHead className="min-w-[280px]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => handleSort("title")}
                  >
                    Task
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Priority
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Assignee
                </TableHead>
                <TableHead className="pr-4">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => handleSort("dueDate")}
                  >
                    Due
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                        <ListTodo className="h-5 w-5 text-muted-foreground" />
                      </span>
                      <p className="font-display text-base font-semibold">
                        No tasks yet
                      </p>
                      <p className="max-w-xs text-sm text-muted-foreground">
                        Create your first task and it will show up here.
                      </p>
                      <Button
                        size="sm"
                        className="mt-2 gap-2"
                        onClick={() => setIsCreateDialogOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        New task
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                sortedTasks.map((task) => {
                  const isSelected = selected.has(task.id);
                  const due = task.dueDate ? new Date(task.dueDate) : null;
                  const isOverdue =
                    due !== null && due < new Date() && task.status !== "DONE";

                  return (
                    <TableRow
                      key={task.id}
                      data-status={task.status}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn(
                        "group relative transition-colors",
                        isSelected && "bg-primary/[0.06]"
                      )}
                    >
                      <TableCell className="relative pl-4">
                        {/* Same colour spine as the board cards. */}
                        <span
                          aria-hidden
                          className="absolute inset-y-0 left-0 w-[3px] bg-[var(--tone)] opacity-0 transition-opacity group-hover:opacity-100 data-[on=true]:opacity-100"
                          data-on={isSelected}
                        />
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(task.id)}
                          aria-label={`Select ${task.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/tasks/${task.id}`}
                          className={cn(
                            "font-medium transition-colors hover:text-primary",
                            task.status === "DONE" &&
                              "text-muted-foreground line-through decoration-1"
                          )}
                        >
                          {task.title}
                        </Link>
                        {(task.commentCount > 0 || task.attachmentCount > 0) && (
                          <span className="ml-2 inline-flex items-center gap-2 align-middle text-[11px] text-muted-foreground">
                            {task.commentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <MessageSquare className="h-3 w-3" />
                                {task.commentCount}
                              </span>
                            )}
                            {task.attachmentCount > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Paperclip className="h-3 w-3" />
                                {task.attachmentCount}
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={task.status} />
                      </TableCell>
                      <TableCell>
                        <PriorityBadge priority={task.priority} />
                      </TableCell>
                      <TableCell>
                        <UserChip user={task.assignee} />
                      </TableCell>
                      <TableCell className="pr-4">
                        {due ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-sm",
                              isOverdue
                                ? "font-medium text-destructive"
                                : "text-muted-foreground"
                            )}
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            {due.toLocaleDateString(undefined, {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground/50">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <BulkActionBar
        selectedIds={[...selected]}
        onClear={() => setSelected(new Set())}
        onApplied={applyBulk}
        onDeleted={(ids) => {
          removeBulk(ids);
          setSelected(new Set());
        }}
      />

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
      />
    </div>
  );
}

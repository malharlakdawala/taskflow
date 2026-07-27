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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { BulkActionBar } from "@/components/tasks/bulk-action-bar";
import { UserChip } from "@/components/tasks/user-chip";
import { notify } from "@/lib/notify";
import type { Task } from "@/lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/types";

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
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">List View</h1>
          <p className="text-muted-foreground">
            Select rows to edit several tasks at once
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 pb-24">
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Select all tasks"
                  />
                </TableHead>
                <TableHead className="w-[300px]">
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort("title")}
                  >
                    Title
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort("dueDate")}
                  >
                    Due Date
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-muted-foreground"
                  >
                    No tasks yet
                  </TableCell>
                </TableRow>
              ) : (
                sortedTasks.map((task) => {
                  const statusConfig = STATUS_CONFIG[task.status];
                  const priorityConfig = PRIORITY_CONFIG[task.priority];
                  const isSelected = selected.has(task.id);

                  return (
                    <TableRow
                      key={task.id}
                      data-state={isSelected ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(task.id)}
                          aria-label={`Select ${task.title}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/tasks/${task.id}`}
                          className="font-medium hover:underline"
                        >
                          {task.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusConfig.color}>
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={priorityConfig.color}>
                          {priorityConfig.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <UserChip user={task.assignee} />
                      </TableCell>
                      <TableCell>
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : "—"}
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

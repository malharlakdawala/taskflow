"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ChevronDown,
  ListTodo,
  MessageSquare,
  Paperclip,
  ArrowUpDown,
  X,
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
import { ProjectBadge } from "@/components/projects/project-badge";
import {
  ProjectFilter,
  UNFILED_PROJECT,
} from "@/components/projects/project-filter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import { useProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { NO_PROJECT_LABEL, PRIORITY_ITEMS, STATUS_ITEMS } from "@/lib/types";

/**
 * How rows are ordered within each status group. "Manual" is the drag order
 * from the board; everything else re-sorts on top of it so switching away
 * and back loses nothing.
 */
type SortKey = "manual" | "priority-desc" | "priority-asc" | "due-asc" | "due-desc";

const SORT_ITEMS: Record<SortKey, string> = {
  manual: "Manual order",
  "priority-desc": "Priority: High to low",
  "priority-asc": "Priority: Low to high",
  "due-asc": "Due date: Soonest first",
  "due-desc": "Due date: Latest first",
};

const PRIORITY_RANK: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  NONE: 0,
};

function parseSort(params: URLSearchParams): SortKey {
  const raw = params.get("sort");
  return raw && raw in SORT_ITEMS ? (raw as SortKey) : "manual";
}

/** Ties fall back to manual order, so a sort never scrambles equal rows. */
function compareTasks(sort: SortKey, a: Task, b: Task): number {
  switch (sort) {
    case "priority-desc":
      return (
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.order - b.order
      );
    case "priority-asc":
      return (
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order
      );
    case "due-asc":
    case "due-desc": {
      // Tasks with no due date are never "soonest" or "latest" — they sink
      // to the bottom regardless of direction.
      if (!a.dueDate && !b.dueDate) return a.order - b.order;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      const diff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return sort === "due-asc" ? diff : -diff;
    }
    default:
      return a.order - b.order;
  }
}

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

/**
 * Filters come from the URL rather than component state, so the dashboard's
 * counts can be links. A number nobody can click is a dead end: seeing "4 in
 * progress" and then having to go and find those four by hand is the whole
 * problem with a stats page.
 */
type Filters = {
  status: TaskStatus | null;
  priority: TaskPriority | null;
  overdue: boolean;
  /** A project id, or UNFILED for tasks in no project at all. */
  project: string | null;
};

/** `?project=none` — shared with the filter control so both agree on the value. */
const UNFILED = UNFILED_PROJECT;

const isActive = (filters: Filters) =>
  filters.status !== null ||
  filters.priority !== null ||
  filters.overdue ||
  filters.project !== null;

/** Anything unrecognised in the query string is ignored rather than fatal. */
function parseFilters(params: URLSearchParams): Filters {
  const status = params.get("status");
  const priority = params.get("priority");
  return {
    status: status && status in STATUS_ITEMS ? (status as TaskStatus) : null,
    priority:
      priority && priority in PRIORITY_ITEMS ? (priority as TaskPriority) : null,
    overdue: params.get("due") === "overdue",
    // Not checked against the real list: an id for a deleted project simply
    // matches nothing, which is a better outcome than a crash or a silent reset.
    project: params.get("project") || null,
  };
}

/** `/list` plus everything still active once `drop` is removed. */
function urlWithout(filters: Filters, drop: keyof Filters): string {
  const next = new URLSearchParams();
  if (drop !== "status" && filters.status) next.set("status", filters.status);
  if (drop !== "priority" && filters.priority)
    next.set("priority", filters.priority);
  if (drop !== "overdue" && filters.overdue) next.set("due", "overdue");
  if (drop !== "project" && filters.project)
    next.set("project", filters.project);
  const query = next.toString();
  return query ? `/list?${query}` : "/list";
}

export default function ListPage() {
  // useSearchParams opts the tree out of prerendering, so it gets its own
  // boundary rather than dragging the whole route client-side.
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ListView />
    </Suspense>
  );
}

function ListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  const sort = useMemo(
    () => parseSort(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );
  // Only for naming the active filter chip — the tasks carry their own project.
  const { projects } = useProjects();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createIn, setCreateIn] = useState<TaskStatus | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(new Set());
  /**
   * "Overdue" is measured against when the data arrived, not when React
   * happens to re-render. Reading the clock during render would make the
   * filtered set depend on how often the component updates.
   */
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");
        const data: Task[] = await response.json();
        if (!cancelled) {
          setTasks(data);
          setLoadedAt(Date.now());
        }
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

  const visible = useMemo(() => {
    if (!isActive(filters)) return tasks;

    return tasks.filter((task) => {
      if (filters.status && task.status !== filters.status) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.overdue) {
        // Matches the dashboard's definition — a finished task is never late.
        if (!task.dueDate || task.status === "DONE") return false;
        if (new Date(task.dueDate).getTime() >= loadedAt) return false;
      }
      if (filters.project) {
        if (filters.project === UNFILED) {
          if (task.projectId !== null) return false;
        } else if (task.projectId !== filters.project) {
          return false;
        }
      }
      return true;
    });
  }, [tasks, filters, loadedAt]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(
      GROUPS.map((s) => [s, [] as Task[]])
    ) as Record<TaskStatus, Task[]>;
    for (const task of visible) map[task.status]?.push(task);
    for (const status of GROUPS) map[status].sort((a, b) => compareTasks(sort, a, b));
    return map;
  }, [visible, sort]);

  // Filtering down to one status and still showing four empty "Add a task to…"
  // sections reads as broken, so empty groups drop out while a filter is on.
  const groups = useMemo(
    () => (isActive(filters) ? GROUPS.filter((s) => grouped[s].length > 0) : GROUPS),
    [filters, grouped]
  );

  const chips: Array<{ key: keyof Filters; label: string }> = [];
  if (filters.status)
    chips.push({ key: "status", label: `Status: ${STATUS_ITEMS[filters.status]}` });
  if (filters.priority)
    chips.push({
      key: "priority",
      label: `Priority: ${PRIORITY_ITEMS[filters.priority]}`,
    });
  if (filters.overdue) chips.push({ key: "overdue", label: "Overdue" });
  if (filters.project) {
    // A project that has since been deleted still gets a removable chip, so the
    // filter is never a state you cannot see or get out of.
    const name =
      filters.project === UNFILED
        ? NO_PROJECT_LABEL
        : projects.find((project) => project.id === filters.project)?.name;
    chips.push({ key: "project", label: `Project: ${name ?? "unknown"}` });
  }

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

  // A selection made before filtering can include rows that are now hidden.
  // Intersecting keeps the bulk bar honest — it should only ever act on what
  // the user can currently see.
  const visibleIds = useMemo(
    () => new Set(visible.map((task) => task.id)),
    [visible]
  );
  const selectedVisible = useMemo(
    () => [...selected].filter((id) => visibleIds.has(id)),
    [selected, visibleIds]
  );
  const allSelected =
    visible.length > 0 && selectedVisible.length === visible.length;

  const openCreate = (status?: TaskStatus) => {
    setCreateIn(status);
    setIsCreateDialogOpen(true);
  };

  /** Keeps the project filter in the URL alongside whatever else is set. */
  const setProjectFilter = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("project", next);
    else params.delete("project");
    const query = params.toString();
    router.push(query ? `/list?${query}` : "/list");
  };

  /** Same pattern as the project filter — sort lives in the URL too. */
  const setSort = (next: SortKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next !== "manual") params.set("sort", next);
    else params.delete("sort");
    const query = params.toString();
    router.push(query ? `/list?${query}` : "/list");
  };

  if (isLoading) return <ListSkeleton />;

  return (
    <div className="enter flex h-full flex-col">
      <header className="border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">List</h1>
            <p className="text-sm text-muted-foreground">
              {selectedVisible.length > 0
                ? `${selectedVisible.length} selected`
                : `${visible.length} ${visible.length === 1 ? "task" : "tasks"}${
                    isActive(filters) ? ` of ${tasks.length}` : ""
                  } · click a row to open it, or edit any field in place`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ProjectFilter value={filters.project} onChange={setProjectFilter} />
            <Select
              items={SORT_ITEMS}
              value={sort}
              onValueChange={(next) => setSort(next as SortKey)}
            >
              <SelectTrigger className="w-[210px]" aria-label="Sort tasks">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Manual order" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORT_ITEMS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => openCreate()} className="gap-2">
              <Plus className="h-4 w-4" />
              New task
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Filtered by
            </span>
            {chips.map((chip) => (
              // Each chip removes only itself, so arriving from "Urgent" and
              // then narrowing to "In Progress" can be unwound one step at a
              // time rather than all or nothing.
              <Link
                key={chip.key}
                href={urlWithout(filters, chip.key)}
                aria-label={`Remove filter ${chip.label}`}
                className="group inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {chip.label}
                <X className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
            {chips.length > 1 && (
              <Link
                href="/list"
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear all
              </Link>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto px-6 py-5 pb-24">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border bg-card py-20 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <ListTodo className="h-5 w-5 text-muted-foreground" />
            </span>
            {isActive(filters) ? (
              <>
                <p className="font-display text-base font-semibold">
                  Nothing matches this filter
                </p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  {tasks.length} {tasks.length === 1 ? "task" : "tasks"} in total,
                  none of them fit.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  render={<Link href="/list" />}
                >
                  Show all tasks
                </Button>
              </>
            ) : (
              <>
                <p className="font-display text-base font-semibold">No tasks yet</p>
                <p className="max-w-xs text-sm text-muted-foreground">
                  Create your first task and it will show up here.
                </p>
                <Button size="sm" className="mt-2 gap-2" onClick={() => openCreate()}>
                  <Plus className="h-4 w-4" />
                  New task
                </Button>
              </>
            )}
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
                indeterminate={selectedVisible.length > 0 && !allSelected}
                onCheckedChange={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(visible.map((t) => t.id))
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
              {groups.map((status) => {
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
                                    {task.project && (
                                      <ProjectBadge
                                        project={task.project}
                                        showIcon={false}
                                        className="max-w-[9rem] shrink-0"
                                      />
                                    )}
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
        selectedIds={selectedVisible}
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
        // Creating from a list filtered to one project keeps the new task in it,
        // otherwise the task you just made vanishes from the view you made it in.
        defaultProjectId={
          filters.project && filters.project !== UNFILED ? filters.project : null
        }
        onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-10 w-1/3" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

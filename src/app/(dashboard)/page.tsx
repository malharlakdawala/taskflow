"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Layers,
  Flame,
  Timer,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { StatusBadge, PriorityBadge } from "@/components/tasks/status-badge";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { Task, TaskStatus, TaskPriority } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

const STATUS_ORDER: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];
const PRIORITY_ORDER: TaskPriority[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
];

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");
        const data = await response.json();
        if (!cancelled) setTasks(data);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
        if (!cancelled) notify.error("Could not load your dashboard");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const byStatus = {} as Record<TaskStatus, number>;
    const byPriority = {} as Record<TaskPriority, number>;
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
    }

    const now = new Date();
    const upcoming = tasks
      .filter((t) => t.dueDate && new Date(t.dueDate) > now && t.status !== "DONE")
      .sort(
        (a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
      )
      .slice(0, 5);
    const overdue = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== "DONE"
    ).length;

    return { byStatus, byPriority, upcoming, overdue };
  }, [tasks]);

  const total = tasks.length;
  const done = stats.byStatus.DONE ?? 0;
  const inProgress = stats.byStatus.IN_PROGRESS ?? 0;
  const urgent = stats.byPriority.URGENT ?? 0;
  const completion = total > 0 ? Math.round((done / total) * 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="enter h-full space-y-6 overflow-auto p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{greeting()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {total === 0 ? (
              "Nothing on your plate yet."
            ) : (
              <>
                {total - done} open · {done} done
                {stats.overdue > 0 && (
                  <>
                    {" · "}
                    <Link
                      href="/list?due=overdue"
                      className="font-medium text-destructive underline-offset-2 hover:underline"
                    >
                      {stats.overdue} overdue
                    </Link>
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Every tile is a link into the list, filtered to exactly the tasks it
            counted. A number you can't act on just tells you to go looking. */}
        <StatCard
          label="Total tasks"
          value={total}
          hint={`${completion}% complete`}
          icon={Layers}
          tone="var(--primary)"
          href="/list"
        />
        <StatCard
          label="Urgent"
          value={urgent}
          hint={urgent > 0 ? "Needs attention now" : "Nothing on fire"}
          icon={Flame}
          tone="var(--priority-urgent)"
          href="/list?priority=URGENT"
        />
        <StatCard
          label="In progress"
          value={inProgress}
          hint="Being worked on"
          icon={Timer}
          tone="var(--status-progress)"
          href="/list?status=IN_PROGRESS"
        />
        <StatCard
          label="Completed"
          value={done}
          hint={`${completion}% of all tasks`}
          icon={CheckCircle2}
          tone="var(--status-done)"
          href="/list?status=DONE"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {STATUS_ORDER.map((status) => (
              <Meter
                key={status}
                attr={{ "data-status": status }}
                label={STATUS_ITEMS[status]}
                count={stats.byStatus[status] ?? 0}
                total={total}
                href={`/list?status=${status}`}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {PRIORITY_ORDER.map((priority) => (
              <Meter
                key={priority}
                attr={{ "data-priority": priority }}
                label={PRIORITY_ITEMS[priority]}
                count={stats.byPriority[priority] ?? 0}
                total={total}
                href={`/list?priority=${priority}`}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Coming up</CardTitle>
          <Link
            href="/calendar"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            Calendar
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {stats.upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="font-display text-base font-semibold">
                No deadlines ahead
              </p>
              <p className="text-sm text-muted-foreground">
                Tasks with a due date will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.upcoming.map((task) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  data-status={task.status}
                  className="tone-rail lift flex items-center justify-between gap-3 rounded-lg border bg-card p-3 pl-4"
                >
                  <span className="tone-rail-bar" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Due{" "}
                      {new Date(task.dueDate!).toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={task.priority} showLabel={false} />
                    <StatusBadge status={task.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
      />
    </div>
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  /** Where the tile's own tasks live. */
  href: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. Show these in the list`}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Card
        className="lift relative h-full overflow-hidden transition-colors hover:border-[var(--tone)]/40"
        style={{ ["--tone" as string]: tone }}
      >
        {/* Each tile is topped by its own metric's colour so the four read apart. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-[var(--tone)]"
        />
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="font-display mt-1.5 text-3xl font-bold leading-none tabular-nums">
              {value}
            </p>
            <p className="mt-1.5 truncate text-xs text-muted-foreground">{hint}</p>
          </div>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: "color-mix(in oklch, var(--tone) 14%, transparent)",
              color: "var(--tone)",
            }}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

function Meter({
  attr,
  label,
  count,
  total,
  href,
}: {
  attr: Record<string, string>;
  label: string;
  count: number;
  total: number;
  href: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <Link
      {...attr}
      href={href}
      aria-label={`${label}: ${count}. Show these in the list`}
      className={cn(
        // Pulled out to the card's padding edge so the hover surface lines up
        // with the row rather than floating inside it.
        "-mx-2 block space-y-1.5 rounded-md px-2 py-1 transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      )}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="h-2 w-2 rounded-full bg-[var(--tone)]" />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--tone)] transition-[width] duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </Link>
  );
}

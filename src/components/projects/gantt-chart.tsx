"use client";

import Link from "next/link";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { STATUS_CONFIG } from "@/lib/types";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScheduledTask {
  task: Task;
  start: Date;
  end: Date;
  /** False when only one of startDate/dueDate is set — drawn as a single day. */
  isRange: boolean;
}

/** Which of a task's two dates actually place it on the timeline, if either. */
function scheduleOf(task: Task): { start: Date; end: Date; isRange: boolean } | null {
  if (!task.startDate && !task.dueDate) return null;
  const start = startOfDay(new Date(task.startDate ?? task.dueDate!));
  const end = startOfDay(new Date(task.dueDate ?? task.startDate!));
  // A start entered after the due date (possible via the MCP, which doesn't
  // share the web form's min/max) still has to draw as a bar that goes
  // forward in time.
  return end < start
    ? { start: end, end: start, isRange: true }
    : { start, end, isRange: task.startDate !== null && task.dueDate !== null };
}

/** Pixels per day, chosen so the busiest realistic project stays scrollable
 *  rather than either microscopic or several screens wide. */
function pxPerDayFor(totalDays: number): number {
  return Math.max(6, Math.min(32, 1400 / totalDays));
}

export function GanttChart({ tasks }: { tasks: Task[] }) {
  const scheduled: ScheduledTask[] = tasks
    .map((task) => {
      const schedule = scheduleOf(task);
      return schedule ? { task, ...schedule } : null;
    })
    .filter((row): row is ScheduledTask => row !== null)
    // Earliest start first, so the chart reads top-to-bottom the way the
    // project is meant to run.
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const unscheduled = tasks.filter((task) => !task.startDate && !task.dueDate);

  if (scheduled.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
        <p className="text-sm font-medium">No dates set yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Give tasks a start or due date — from the task page, or the board
          card — and they&rsquo;ll show up here as a timeline.
        </p>
      </div>
    );
  }

  // Padded by two days on each side so the first and last bars aren't flush
  // against the chart's edge.
  const rangeStart = addDays(
    scheduled.reduce((min, row) => (row.start < min ? row.start : min), scheduled[0].start),
    -2
  );
  const rangeEnd = addDays(
    scheduled.reduce((max, row) => (row.end > max ? row.end : max), scheduled[0].end),
    2
  );
  const totalDays = Math.max(1, differenceInCalendarDays(rangeEnd, rangeStart) + 1);
  const pxPerDay = pxPerDayFor(totalDays);
  const chartWidth = totalDays * pxPerDay;

  const today = startOfDay(new Date());
  const todayOffset = differenceInCalendarDays(today, rangeStart);
  const showToday = todayOffset >= 0 && todayOffset < totalDays;

  // Weekly gridlines read cleanly at almost any zoom; daily ones would be
  // noise once a project runs more than a few weeks.
  const weekTicks: number[] = [];
  for (let d = 0; d < totalDays; d += 7) weekTicks.push(d);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border">
        <div className="flex">
          {/* Titles never scroll horizontally — only the timeline does. */}
          <div className="w-56 shrink-0 border-r bg-muted/30">
            <div className="flex h-10 items-end border-b px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Task
            </div>
            {scheduled.map(({ task }) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="flex h-10 items-center truncate border-b px-3 text-sm last:border-b-0 hover:text-primary hover:underline"
                title={task.title}
              >
                {task.title}
              </Link>
            ))}
          </div>

          <div className="flex-1 overflow-x-auto">
            <div style={{ width: chartWidth }} className="relative">
              {/* Date ruler */}
              <div className="relative flex h-10 items-end border-b pb-1.5">
                {weekTicks.map((offset) => (
                  <span
                    key={offset}
                    className="absolute text-[11px] font-medium text-muted-foreground"
                    style={{ left: offset * pxPerDay + 4 }}
                  >
                    {format(addDays(rangeStart, offset), "d MMM")}
                  </span>
                ))}
              </div>

              {/* Gridlines + bars, one row per task, in the same order as the
                  title column so they line up. */}
              <div className="relative">
                {weekTicks.map((offset) => (
                  <span
                    key={offset}
                    aria-hidden
                    className="absolute top-0 bottom-0 w-px bg-border"
                    style={{ left: offset * pxPerDay }}
                  />
                ))}
                {showToday && (
                  <span
                    aria-hidden
                    className="absolute top-0 bottom-0 w-0.5 bg-destructive/70"
                    style={{ left: todayOffset * pxPerDay }}
                    title="Today"
                  />
                )}

                {scheduled.map(({ task, start, end, isRange }) => {
                  const offset = differenceInCalendarDays(start, rangeStart);
                  const span = differenceInCalendarDays(end, start) + 1;
                  const tone = STATUS_CONFIG[task.status].color;
                  const isDone = task.status === "DONE";

                  return (
                    <div key={task.id} className="relative h-10 border-b last:border-b-0">
                      <div
                        className={cn(
                          "lift absolute top-1.5 h-7 rounded-md",
                          tone,
                          isDone && "opacity-60",
                          !isRange && "opacity-80"
                        )}
                        style={{
                          left: offset * pxPerDay,
                          width: Math.max(pxPerDay * span - 2, 6),
                        }}
                        title={`${task.title} · ${format(start, "d MMM")}${
                          isRange ? ` – ${format(end, "d MMM")}` : ""
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="rounded-xl border border-dashed p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            No dates set ({unscheduled.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {unscheduled.map((task) => (
              <li key={task.id}>
                <Link
                  href={`/tasks/${task.id}`}
                  className="rounded-full border bg-card px-2.5 py-1 text-xs hover:text-primary"
                >
                  {task.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

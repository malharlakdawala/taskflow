"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Calendar, Plus } from "lucide-react";
import { useMembers } from "@/lib/use-members";
import { cn, displayName, initialsFor } from "@/lib/utils";
import { StatusBadge, PriorityBadge, StatusDot } from "@/components/tasks/status-badge";
import type { Task, TaskStatus, TaskPriority, User } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

const STATUSES = Object.keys(STATUS_ITEMS) as TaskStatus[];
const PRIORITIES = Object.keys(PRIORITY_ITEMS) as TaskPriority[];
const UNASSIGNED = "__unassigned__";

/**
 * Editable cells for the list view.
 *
 * Each one swallows its own clicks: the surrounding row navigates to the task,
 * so without stopPropagation opening a dropdown would also open the task.
 */
function Stop({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Borderless trigger — the badge itself is the control. */
const ghostTrigger =
  "h-auto w-auto gap-1 border-transparent bg-transparent p-0 shadow-none " +
  "hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring/40 " +
  "[&>svg]:opacity-0 [&>svg]:transition-opacity group-hover/row:[&>svg]:opacity-60";

export function StatusCell({
  status,
  onChange,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
}) {
  return (
    <Stop>
      <Select
        items={STATUS_ITEMS}
        value={status}
        onValueChange={(v) => v && v !== status && onChange(v as TaskStatus)}
      >
        <SelectTrigger className={ghostTrigger} aria-label="Change status">
          <StatusBadge status={status} />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              <span className="flex items-center gap-2">
                <StatusDot status={value} />
                {STATUS_ITEMS[value]}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Stop>
  );
}

export function PriorityCell({
  priority,
  onChange,
}: {
  priority: TaskPriority;
  onChange: (next: TaskPriority) => void;
}) {
  return (
    <Stop>
      <Select
        items={PRIORITY_ITEMS}
        value={priority}
        onValueChange={(v) => v && v !== priority && onChange(v as TaskPriority)}
      >
        <SelectTrigger className={ghostTrigger} aria-label="Change priority">
          <PriorityBadge priority={priority} />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((value) => (
            <SelectItem key={value} value={value}>
              <PriorityBadge priority={value} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Stop>
  );
}

export function AssigneeCell({
  assignee,
  onChange,
}: {
  assignee: User | null;
  onChange: (assigneeId: string | null) => void;
}) {
  const { members } = useMembers();
  const items: Record<string, string> = { [UNASSIGNED]: "Unassigned" };
  for (const member of members) items[member.id] = displayName(member);

  return (
    <Stop>
      <Select
        items={items}
        value={assignee?.id ?? UNASSIGNED}
        onValueChange={(v) => {
          const next = v === UNASSIGNED ? null : v;
          if (next !== (assignee?.id ?? null)) onChange(next);
        }}
      >
        <SelectTrigger className={ghostTrigger} aria-label="Change assignee">
          {assignee ? (
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary ring-1 ring-primary/20">
                {initialsFor(assignee)}
              </span>
              <span className="truncate text-sm">{displayName(assignee)}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed">
                <Plus className="h-3 w-3" />
              </span>
              Assign
            </span>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {displayName(member)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Stop>
  );
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function DueDateCell({
  task,
  onChange,
}: {
  task: Pick<Task, "dueDate" | "status">;
  onChange: (value: string | null) => void;
}) {
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due !== null && due < new Date() && task.status !== "DONE";

  return (
    <Stop className="relative inline-flex items-center">
      {/* The native picker sits invisibly over the label so the whole cell is
          the hit target without needing a custom calendar. */}
      <input
        type="date"
        aria-label="Change due date"
        value={toDateInput(task.dueDate)}
        onChange={(e) => onChange(e.target.value || null)}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "pointer-events-none inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm",
          isOverdue
            ? "font-medium text-destructive"
            : due
              ? "text-muted-foreground"
              : "text-muted-foreground/50"
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        {due
          ? due.toLocaleDateString(undefined, { day: "numeric", month: "short" })
          : "Set date"}
      </span>
    </Stop>
  );
}

import {
  CircleDashed,
  Circle,
  CircleDotDashed,
  CircleDot,
  CheckCircle2,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskPriority } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

/**
 * Colour comes from the data-status / data-priority attribute via the --tone
 * custom properties defined in globals.css, so these components never hardcode
 * a hue and light/dark is handled for free.
 */

const STATUS_ICONS: Record<TaskStatus, LucideIcon> = {
  BACKLOG: CircleDashed,
  TODO: Circle,
  IN_PROGRESS: CircleDotDashed,
  IN_REVIEW: CircleDot,
  DONE: CheckCircle2,
};

export function StatusBadge({
  status,
  className,
  showLabel = true,
}: {
  status: TaskStatus;
  className?: string;
  showLabel?: boolean;
}) {
  const Icon = STATUS_ICONS[status];

  return (
    <span
      data-status={status}
      className={cn(
        "tone-chip inline-flex items-center gap-1.5 rounded-full px-2 py-0.5",
        "text-[11px] font-semibold uppercase tracking-wide",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      {showLabel && STATUS_ITEMS[status]}
    </span>
  );
}

/** A small dot for tight spots such as column headers and select options. */
export function StatusDot({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <span
      data-status={status}
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--tone)]", className)}
    />
  );
}

export function PriorityBadge({
  priority,
  className,
  showLabel = true,
}: {
  priority: TaskPriority;
  className?: string;
  showLabel?: boolean;
}) {
  // "No priority" is the default on most tasks; rendering it everywhere would
  // add noise without adding information.
  if (priority === "NONE" && !showLabel) return null;

  return (
    <span
      data-priority={priority}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-[var(--tone)]",
        className
      )}
      title={`${PRIORITY_ITEMS[priority]} priority`}
    >
      <Flag
        className="h-3.5 w-3.5"
        strokeWidth={2.5}
        fill={priority === "NONE" ? "none" : "currentColor"}
      />
      {showLabel && PRIORITY_ITEMS[priority]}
    </span>
  );
}

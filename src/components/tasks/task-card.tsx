"use client";

import { Calendar, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { cn, toPlainText, initialsFor, displayName } from "@/lib/utils";
import { PriorityBadge } from "@/components/tasks/status-badge";
import { ProjectBadge } from "@/components/projects/project-badge";

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onDelete?: (taskId: string) => void;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  const preview = toPlainText(task.description);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due !== null && due < new Date() && task.status !== "DONE";
  const isDone = task.status === "DONE";

  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        "block rounded-xl focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      <article
        data-status={task.status}
        className={cn(
          "tone-rail lift group rounded-xl border bg-card p-3 pl-4",
          isDragging && "rotate-1 shadow-xl ring-2 ring-primary/30"
        )}
      >
        {/* Signature: the colour spine telling you the state without reading. */}
        <span className="tone-rail-bar" aria-hidden />

        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              "text-sm font-medium leading-snug line-clamp-2",
              "transition-colors group-hover:text-primary",
              isDone && "text-muted-foreground line-through decoration-1"
            )}
          >
            {task.title}
          </h3>
          <PriorityBadge
            priority={task.priority}
            showLabel={false}
            className="mt-0.5 shrink-0"
          />
        </div>

        {preview && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {preview}
          </p>
        )}

        {/* The project reads as a label on the work rather than another piece
            of metadata, so it sits above the counts on its own line. */}
        {task.project && (
          <div className="mt-2 flex">
            <ProjectBadge project={task.project} className="max-w-[11rem]" />
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5 text-[11px] text-muted-foreground">
            {due && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
                  isOverdue
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted"
                )}
              >
                <Calendar className="h-3 w-3" />
                {due.toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            )}
            {task.commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {task.commentCount}
              </span>
            )}
            {task.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.attachmentCount}
              </span>
            )}
          </div>

          {task.assignee && (
            <span
              title={displayName(task.assignee)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[10px] font-bold text-primary ring-1 ring-primary/20"
            >
              {initialsFor(task.assignee)}
            </span>
          )}
        </div>
      </article>
    </Link>
  );
}

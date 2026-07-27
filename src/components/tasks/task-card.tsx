"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import { cn, toPlainText } from "@/lib/utils";
import { UserChip } from "@/components/tasks/user-chip";

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onDelete?: (taskId: string) => void;
}

export function TaskCard({ task, isDragging }: TaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const preview = toPlainText(task.description);

  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due !== null && due < new Date() && task.status !== "DONE";

  return (
    <Link href={`/tasks/${task.id}`}>
      <Card
        className={cn(
          "cursor-pointer transition-shadow hover:shadow-md",
          isDragging && "shadow-lg rotate-2"
        )}
      >
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium line-clamp-2">{task.title}</h3>
              {task.priority !== "NONE" && (
                <span
                  className={cn(
                    "shrink-0 text-xs font-medium",
                    priorityConfig.color
                  )}
                >
                  {priorityConfig.label}
                </span>
              )}
            </div>

            {preview && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {preview}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {due && (
                <span
                  className={cn(
                    "flex items-center gap-1",
                    isOverdue && "font-medium text-destructive"
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  {due.toLocaleDateString()}
                </span>
              )}
              {task.commentCount > 0 && (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {task.commentCount}
                </span>
              )}
              {task.attachmentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Paperclip className="h-3 w-3" />
                  {task.attachmentCount}
                </span>
              )}
            </div>

            {task.assignee && (
              <UserChip user={task.assignee} className="pt-1" />
            )}

            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs"
                    style={
                      tag.tag.color
                        ? { backgroundColor: tag.tag.color }
                        : undefined
                    }
                  >
                    {tag.tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, User } from "lucide-react";
import Link from "next/link";
import type { Task } from "@/lib/types";
import { PRIORITY_CONFIG } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onDelete?: (taskId: string) => void;
}

export function TaskCard({ task, isDragging, onDelete }: TaskCardProps) {
  const priorityConfig = PRIORITY_CONFIG[task.priority];

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
                <span className={cn("text-xs font-medium", priorityConfig.color)}>
                  {priorityConfig.label}
                </span>
              )}
            </div>
            
            {task.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {typeof task.description === 'string' 
                  ? task.description 
                  : JSON.stringify(task.description)}
              </p>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {task.dueDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.dueDate).toLocaleDateString()}
                </div>
              )}
              {task.assignee && (
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {task.assignee.name || task.assignee.email}
                </div>
              )}
            </div>

            {task.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.tags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="text-xs"
                    style={tag.tag.color ? { backgroundColor: tag.tag.color } : undefined}
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

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, X, Loader2 } from "lucide-react";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { ProjectPicker } from "@/components/projects/project-picker";
import { notify } from "@/lib/notify";
import { useProjects } from "@/lib/use-projects";
import type { Task } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

/**
 * Floating bar shown while rows are selected in the list view.
 *
 * Every action is a single request against /api/tasks/bulk rather than one per
 * task — with ~140ms per round-trip, changing 20 tasks individually would take
 * about three seconds.
 */
export function BulkActionBar({
  selectedIds,
  onClear,
  onApplied,
  onDeleted,
}: {
  selectedIds: string[];
  onClear: () => void;
  onApplied: (ids: string[], changes: Partial<Task>) => void;
  onDeleted: (ids: string[]) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);
  // Needed to build the optimistic chip: the route returns a count, not rows,
  // so the new project has to be described from what the client already knows.
  const { projects } = useProjects();

  if (selectedIds.length === 0) return null;

  const count = selectedIds.length;
  const label = `${count} task${count === 1 ? "" : "s"}`;

  const apply = async (
    payload: Record<string, unknown>,
    optimistic: Partial<Task>,
    message: string
  ) => {
    setIsBusy(true);
    try {
      const response = await fetch("/api/tasks/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Bulk update failed");

      onApplied(selectedIds, optimistic);
      notify.success(`${message} for ${label}`);
    } catch (error) {
      notify.error(
        "Bulk update failed",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    setIsBusy(true);
    try {
      const response = await fetch("/api/tasks/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Bulk delete failed");

      onDeleted(selectedIds);
      notify.success(`Deleted ${label}`);
    } catch (error) {
      notify.error(
        "Bulk delete failed",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-20 border-t bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
          {label} selected
        </span>

        <div className="w-[150px]">
          <Select
            items={STATUS_ITEMS}
            value=""
            disabled={isBusy}
            onValueChange={(v) =>
              v && apply({ status: v }, { status: v as Task["status"] }, "Status updated")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Set status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BACKLOG">Backlog</SelectItem>
              <SelectItem value="TODO">To Do</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="IN_REVIEW">In Review</SelectItem>
              <SelectItem value="DONE">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[150px]">
          <Select
            items={PRIORITY_ITEMS}
            value=""
            disabled={isBusy}
            onValueChange={(v) =>
              v &&
              apply(
                { priority: v },
                { priority: v as Task["priority"] },
                "Priority updated"
              )
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Set priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">No Priority</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[190px]">
          <AssigneePicker
            value={null}
            disabled={isBusy}
            placeholder="Set assignee"
            onChange={(assigneeId) =>
              apply({ assigneeId }, { assigneeId }, "Assignee updated")
            }
          />
        </div>

        <div className="w-[190px]">
          <ProjectPicker
            value={null}
            disabled={isBusy}
            placeholder="Set project"
            onChange={(projectId) => {
              const project = projectId
                ? projects.find((candidate) => candidate.id === projectId)
                : undefined;
              apply(
                { projectId },
                {
                  projectId,
                  // Trimmed to the summary shape a task carries, so the chips in
                  // the rows update without waiting for a refetch.
                  project: project
                    ? {
                        id: project.id,
                        name: project.name,
                        color: project.color,
                        archived: project.archived,
                      }
                    : null,
                },
                projectId ? "Project updated" : "Project cleared"
              );
            }}
          />
        </div>

        <Input
          type="date"
          className="w-[160px]"
          disabled={isBusy}
          aria-label="Set due date for selected tasks"
          onChange={(e) => {
            const value = e.target.value || null;
            apply(
              { dueDate: value },
              { dueDate: value ? new Date(value).toISOString() : null },
              "Due date updated"
            );
          }}
        />

        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isBusy}
          onClick={remove}
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={onClear}
          disabled={isBusy}
        >
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>
    </div>
  );
}

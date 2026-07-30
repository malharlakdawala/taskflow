"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProjects } from "@/lib/use-projects";
import { ProjectBadge, ProjectDot } from "@/components/projects/project-badge";
import { NO_PROJECT_LABEL } from "@/lib/types";

/** Sentinel: Select cannot hold an empty-string value. */
const NO_PROJECT = "__no_project__";

export function ProjectPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
  disabled?: boolean;
}) {
  const { projects, isLoading } = useProjects();

  // Archiving a project takes it out of the pickers — but not off the task it
  // is already on. Dropping it from this list would mean editing anything else
  // about that task silently refiled it as unfiled.
  const selectable = useMemo(
    () => projects.filter((project) => !project.archived || project.id === value),
    [projects, value]
  );
  const selected = selectable.find((project) => project.id === value) ?? null;

  // Without this map Base UI renders the raw value, which would show the
  // sentinel and bare uuids in the trigger.
  const items = useMemo(() => {
    const map: Record<string, string> = { [NO_PROJECT]: NO_PROJECT_LABEL };
    for (const project of selectable) map[project.id] = project.name;
    return map;
  }, [selectable]);

  return (
    <Select
      items={items}
      value={value ?? NO_PROJECT}
      onValueChange={(next) =>
        onChange(next === NO_PROJECT || next === null ? null : next)
      }
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        {selected ? (
          <ProjectBadge project={selected} />
        ) : (
          <SelectValue placeholder={isLoading ? "Loading…" : NO_PROJECT_LABEL}>
            {() => NO_PROJECT_LABEL}
          </SelectValue>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PROJECT}>{NO_PROJECT_LABEL}</SelectItem>
        {selectable.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex min-w-0 items-center gap-2">
              <ProjectDot color={project.color} />
              <span className="truncate">{project.name}</span>
              {project.archived && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  archived
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

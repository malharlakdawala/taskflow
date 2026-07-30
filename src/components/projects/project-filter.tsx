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
import { ProjectDot } from "@/components/projects/project-badge";
import { NO_PROJECT_LABEL } from "@/lib/types";

/** Sentinel: Select cannot hold an empty-string value. */
const ALL_PROJECTS = "__all__";

/**
 * "No project" is a filter in its own right, not the absence of one — plenty of
 * work is deliberately unfiled and needs to be findable. Shared with the list
 * page, which puts this value in the query string.
 */
export const UNFILED_PROJECT = "none";

/**
 * Used by both the board and the list. `value` is a project id,
 * UNFILED_PROJECT, or null for no filter at all — the list keeps that in the
 * URL so the view is linkable, the board in local state.
 */
export function ProjectFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { projects } = useProjects();

  // Archived projects stay out of the way unless one is what you are looking at.
  const selectable = projects.filter(
    (project) => !project.archived || project.id === value
  );

  const items = useMemo(() => {
    const map: Record<string, string> = {
      [ALL_PROJECTS]: "All projects",
      [UNFILED_PROJECT]: NO_PROJECT_LABEL,
    };
    for (const project of selectable) map[project.id] = project.name;
    return map;
  }, [selectable]);

  return (
    <Select
      items={items}
      value={value ?? ALL_PROJECTS}
      onValueChange={(next) =>
        onChange(!next || next === ALL_PROJECTS ? null : next)
      }
    >
      <SelectTrigger className="w-[190px]" aria-label="Filter by project">
        <SelectValue placeholder="All projects" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PROJECTS}>All projects</SelectItem>
        <SelectItem value={UNFILED_PROJECT}>{NO_PROJECT_LABEL}</SelectItem>
        {selectable.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            <span className="flex min-w-0 items-center gap-2">
              <ProjectDot color={project.color} />
              <span className="truncate">{project.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

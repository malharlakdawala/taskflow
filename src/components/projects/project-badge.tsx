import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectColor, ProjectSummary } from "@/lib/types";

/**
 * Colour arrives through the data-project-color attribute and the --tone custom
 * properties in globals.css, exactly as StatusBadge works — so nothing here
 * names a hue and light/dark is handled for free.
 *
 * Unlike the status and priority chips, the label is not uppercased: a project
 * name is something a person chose, and shouting it back at them reads badly.
 */
export function ProjectBadge({
  project,
  className,
  showIcon = true,
}: {
  project: Pick<ProjectSummary, "name" | "color">;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <span
      data-project-color={project.color ?? "slate"}
      className={cn(
        "tone-chip inline-flex min-w-0 max-w-full items-center gap-1 rounded-full px-2 py-0.5",
        "text-[11px] font-semibold",
        className
      )}
      title={project.name}
    >
      {showIcon && <Folder className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
      <span className="truncate">{project.name}</span>
    </span>
  );
}

/** A dot for tight spots: select options, sidebar rows, filter triggers. */
export function ProjectDot({
  color,
  className,
}: {
  color: ProjectColor | null;
  className?: string;
}) {
  return (
    <span
      data-project-color={color ?? "slate"}
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--tone)]",
        className
      )}
    />
  );
}

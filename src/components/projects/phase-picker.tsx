"use client";

import { useMemo } from "react";
import { Layers } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePhases } from "@/lib/use-phases";
import { cn } from "@/lib/utils";
import { NO_PHASE_LABEL, type PhaseSummary } from "@/lib/types";

/** Sentinel: Select cannot hold an empty-string value. */
const NO_PHASE = "__no_phase__";

/** A small neutral chip — phases borrow no colour, the project already has one. */
export function PhaseBadge({
  phase,
  className,
}: {
  phase: Pick<PhaseSummary, "name">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium text-muted-foreground",
        className
      )}
      title={phase.name}
    >
      <Layers className="h-3 w-3 shrink-0" />
      <span className="truncate">{phase.name}</span>
    </span>
  );
}

/**
 * Picks a phase of `projectId`. Renders nothing for an unfiled task or a
 * project with no phases — there is nothing to choose, and an empty dropdown
 * would only invite the question of how to fill it.
 */
export function PhasePicker({
  projectId,
  value,
  onChange,
  disabled,
}: {
  projectId: string | null;
  value: string | null;
  onChange: (phaseId: string | null) => void;
  disabled?: boolean;
}) {
  const { phases, isLoading } = usePhases(projectId);

  const items = useMemo(() => {
    const map: Record<string, string> = { [NO_PHASE]: NO_PHASE_LABEL };
    for (const phase of phases) map[phase.id] = phase.name;
    return map;
  }, [phases]);

  if (!projectId || (!isLoading && phases.length === 0)) return null;

  return (
    <Select
      items={items}
      value={value ?? NO_PHASE}
      onValueChange={(next) => onChange(next === NO_PHASE || next === null ? null : next)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger aria-label="Phase">
        <SelectValue placeholder={isLoading ? "Loading…" : NO_PHASE_LABEL} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PHASE}>{NO_PHASE_LABEL}</SelectItem>
        {phases.map((phase) => (
          <SelectItem key={phase.id} value={phase.id}>
            <span className="truncate">{phase.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Shared with the list page, which keeps this value in the query string. */
export const UNPHASED = "none";
const ALL_PHASES = "__all__";

/** The list's phase filter. Only shown once the list is narrowed to one project. */
export function PhaseFilter({
  projectId,
  value,
  onChange,
}: {
  projectId: string;
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { phases } = usePhases(projectId);

  const items = useMemo(() => {
    const map: Record<string, string> = {
      [ALL_PHASES]: "All phases",
      [UNPHASED]: NO_PHASE_LABEL,
    };
    for (const phase of phases) map[phase.id] = phase.name;
    return map;
  }, [phases]);

  if (phases.length === 0 && value === null) return null;

  return (
    <Select
      items={items}
      value={value ?? ALL_PHASES}
      onValueChange={(next) => onChange(!next || next === ALL_PHASES ? null : next)}
    >
      <SelectTrigger className="w-[190px]" aria-label="Filter by phase">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <SelectValue placeholder="All phases" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PHASES}>All phases</SelectItem>
        <SelectItem value={UNPHASED}>{NO_PHASE_LABEL}</SelectItem>
        {phases.map((phase) => (
          <SelectItem key={phase.id} value={phase.id}>
            <span className="truncate">{phase.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

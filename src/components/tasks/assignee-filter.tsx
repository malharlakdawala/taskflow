"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMembers } from "@/lib/use-members";
import { displayName } from "@/lib/utils";

/** Sentinel: Select cannot hold an empty-string value. */
const ALL_ASSIGNEES = "__all__";

/**
 * "Unassigned" is a filter in its own right — work nobody has picked up yet is
 * exactly what you go looking for. Shared with the list page's query string.
 */
export const UNASSIGNED_FILTER = "none";

/** `value` is a user id, UNASSIGNED_FILTER, or null for no filter at all. */
export function AssigneeFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const { members } = useMembers();

  const items = useMemo(() => {
    const map: Record<string, string> = {
      [ALL_ASSIGNEES]: "All assignees",
      [UNASSIGNED_FILTER]: "Unassigned",
    };
    for (const member of members) map[member.id] = displayName(member);
    return map;
  }, [members]);

  return (
    <Select
      items={items}
      value={value ?? ALL_ASSIGNEES}
      onValueChange={(next) =>
        onChange(!next || next === ALL_ASSIGNEES ? null : next)
      }
    >
      <SelectTrigger className="w-[180px]" aria-label="Filter by assignee">
        <SelectValue placeholder="All assignees" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_ASSIGNEES}>All assignees</SelectItem>
        <SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            <span className="truncate">{displayName(member)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
import { UserChip } from "@/components/tasks/user-chip";

/** Sentinel: Select cannot hold an empty-string value. */
const UNASSIGNED = "__unassigned__";

export function AssigneePicker({
  value,
  onChange,
  disabled,
  placeholder = "Unassigned",
}: {
  value: string | null;
  onChange: (assigneeId: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { members, isLoading } = useMembers();
  const selected = members.find((m) => m.id === value) ?? null;

  // Without this map Base UI renders the raw value, which showed the
  // "__unassigned__" sentinel and bare uuids in the trigger.
  const items = useMemo(() => {
    const map: Record<string, string> = { [UNASSIGNED]: placeholder };
    for (const member of members) map[member.id] = displayName(member);
    return map;
  }, [members, placeholder]);

  return (
    <Select
      items={items}
      value={value ?? UNASSIGNED}
      onValueChange={(next) =>
        onChange(next === UNASSIGNED || next === null ? null : next)
      }
      disabled={disabled || isLoading}
    >
      <SelectTrigger>
        {selected ? (
          <UserChip user={selected} />
        ) : (
          <SelectValue placeholder={isLoading ? "Loading…" : placeholder}>
            {() => placeholder}
          </SelectValue>
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>{placeholder}</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {displayName(member)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

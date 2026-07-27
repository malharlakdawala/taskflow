"use client";

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

  return (
    <Select
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
          <SelectValue placeholder={isLoading ? "Loading…" : placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
        {members.map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {displayName(member)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

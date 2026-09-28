"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { notify } from "@/lib/notify";
import { displayName, initialsFor } from "@/lib/utils";
import type { Project, ProjectMember, ProjectRole } from "@/lib/types";

const ROLE_ITEMS: Record<ProjectRole, string> = {
  VIEWER: "Viewer",
  EDITOR: "Editor",
};

interface ProjectMembersDialogProps {
  project: Project | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Who can see or edit one project's tasks. Reachable only from a project this
 * member already EDITs (or an admin) — a VIEWER never sees this button, since
 * managing the roster is an editor's job, same as editing the project itself.
 */
export function ProjectMembersDialog({
  project,
  onOpenChange,
}: ProjectMembersDialogProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("EDITOR");
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    if (!project) return;
    let cancelled = false;

    fetch(`/api/projects/${project.id}/members`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load members");
        return res.json();
      })
      .then((data: ProjectMember[]) => {
        if (!cancelled) setMembers(data);
      })
      .catch(() => {
        if (!cancelled) notify.error("Could not load members");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setIsAdding(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not add member");

      setMembers((prev) => [
        ...prev.filter((m) => m.user.id !== body.user.id),
        body as ProjectMember,
      ]);
      setEmail("");
      notify.success(`${displayName(body.user)} added to ${project.name}`);
    } catch (error) {
      notify.error(
        "Could not add member",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsAdding(false);
    }
  };

  const changeRole = async (member: ProjectMember, nextRole: ProjectRole) => {
    setBusyId(member.user.id);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/members/${member.user.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        }
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Update failed");
      setMembers((prev) =>
        prev.map((m) => (m.user.id === member.user.id ? body : m))
      );
    } catch (error) {
      notify.error(
        "Could not change role",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: ProjectMember) => {
    setBusyId(member.user.id);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/members/${member.user.id}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Remove failed");
      setMembers((prev) => prev.filter((m) => m.user.id !== member.user.id));
    } catch {
      notify.error("Could not remove member");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Members — {project.name}
          </DialogTitle>
          <DialogDescription>
            Only people listed here can see or edit this project&rsquo;s tasks.
            A Viewer can look; an Editor can also change and delete them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAdd} className="flex items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Add a member
            </label>
            <Input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isAdding}
            />
          </div>
          <Select
            items={ROLE_ITEMS}
            value={role}
            onValueChange={(v) => v && setRole(v as ProjectRole)}
            disabled={isAdding}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EDITOR">Editor</SelectItem>
              <SelectItem value="VIEWER">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={isAdding || !email.trim()}>
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
          </Button>
        </form>

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {isLoading ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : members.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nobody has been added yet — only admins can see this project.
            </p>
          ) : (
            members.map((member) => {
              const isBusy = busyId === member.user.id;
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {initialsFor(member.user)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {displayName(member.user)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.user.email}
                    </p>
                  </div>
                  <Select
                    items={ROLE_ITEMS}
                    value={member.role}
                    onValueChange={(v) =>
                      v && changeRole(member, v as ProjectRole)
                    }
                    disabled={isBusy}
                  >
                    <SelectTrigger className="h-8 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EDITOR">Editor</SelectItem>
                      <SelectItem value="VIEWER">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={isBusy}
                    aria-label={`Remove ${displayName(member.user)}`}
                    onClick={() => remove(member)}
                  >
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserMinus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
        {members.length > 0 && (
          <Badge variant="outline" className="w-fit text-[10px]">
            {members.length} {members.length === 1 ? "member" : "members"}
          </Badge>
        )}
      </DialogContent>
    </Dialog>
  );
}

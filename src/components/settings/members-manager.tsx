"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, ShieldCheck, ShieldOff, UserMinus } from "lucide-react";
import { notify } from "@/lib/notify";
import { displayName, initialsFor } from "@/lib/utils";
import type { Member, UserRole, UserStatus } from "@/lib/types";

export function MembersManager({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/members");
        if (!response.ok) throw new Error("Failed to load members");
        const data = await response.json();
        if (!cancelled) setMembers(data);
      } catch (error) {
        console.error(error);
        if (!cancelled) notify.error("Could not load members");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = async (
    id: string,
    changes: { role?: UserRole; status?: UserStatus },
    successMessage: string
  ) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Update failed");

      setMembers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, ...body } : m))
      );
      notify.success(successMessage);
    } catch (error) {
      notify.error(
        "Could not update member",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const pending = members.filter((m) => m.status === "PENDING");
  const active = members.filter((m) => m.status === "ACTIVE");
  const declined = members.filter((m) => m.status === "REJECTED");

  const Row = ({ member, children }: { member: Member; children: React.ReactNode }) => (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initialsFor(member)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{displayName(member)}</p>
          {member.role === "ADMIN" && (
            <Badge variant="secondary" className="text-[10px]">Admin</Badge>
          )}
          {member.id === currentUserId && (
            <Badge variant="outline" className="text-[10px]">You</Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Pending approval
            {pending.length > 0 && (
              <Badge variant="secondary">{pending.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            New sign-ups cannot see any tasks until you approve them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nobody is waiting for approval.
            </p>
          ) : (
            pending.map((member) => (
              <Row key={member.id} member={member}>
                <Button
                  size="sm"
                  disabled={busyId === member.id}
                  onClick={() =>
                    patch(member.id, { status: "ACTIVE" }, `${displayName(member)} approved`)
                  }
                >
                  <Check className="mr-1 h-4 w-4" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === member.id}
                  onClick={() =>
                    patch(member.id, { status: "REJECTED" }, `${displayName(member)} declined`)
                  }
                >
                  <X className="mr-1 h-4 w-4" />
                  Decline
                </Button>
              </Row>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Everyone here can see and edit every task in the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {active.map((member) => {
            const isSelf = member.id === currentUserId;
            return (
              <Row key={member.id} member={member}>
                {!isSelf && (
                  <>
                    {member.role === "MEMBER" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === member.id}
                        onClick={() =>
                          patch(member.id, { role: "ADMIN" }, `${displayName(member)} is now an admin`)
                        }
                      >
                        <ShieldCheck className="mr-1 h-4 w-4" />
                        Make admin
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === member.id}
                        onClick={() =>
                          patch(member.id, { role: "MEMBER" }, `${displayName(member)} is no longer an admin`)
                        }
                      >
                        <ShieldOff className="mr-1 h-4 w-4" />
                        Remove admin
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={busyId === member.id}
                      onClick={() =>
                        patch(member.id, { status: "REJECTED" }, `${displayName(member)} revoked`)
                      }
                    >
                      <UserMinus className="mr-1 h-4 w-4" />
                      Revoke
                    </Button>
                  </>
                )}
              </Row>
            );
          })}
        </CardContent>
      </Card>

      {declined.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No access</CardTitle>
            <CardDescription>
              These accounts exist but cannot see anything.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {declined.map((member) => (
              <Row key={member.id} member={member}>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === member.id}
                  onClick={() =>
                    patch(member.id, { status: "ACTIVE" }, `${displayName(member)} restored`)
                  }
                >
                  <Check className="mr-1 h-4 w-4" />
                  Grant access
                </Button>
              </Row>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

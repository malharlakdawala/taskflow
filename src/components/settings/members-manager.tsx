"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { InviteDialog, CopyLink } from "@/components/settings/invite-dialog";
import { notify } from "@/lib/notify";
import { displayName, initialsFor } from "@/lib/utils";
import type {
  Invitation,
  InviteResult,
  Member,
  UserRole,
  UserStatus,
} from "@/lib/types";

/**
 * Settings → Members.
 *
 * Three states of membership, in the order an admin deals with them:
 * invitations they have sent out, sign-ups waiting to be let in, and the people
 * already here.
 */

/** Fetches, and only fetches — the caller decides what to do with the answer. */
async function fetchRoster(): Promise<{
  members: Member[];
  invitations: Invitation[];
}> {
  const [membersResponse, invitationsResponse] = await Promise.all([
    fetch("/api/members"),
    fetch("/api/invitations"),
  ]);
  if (!membersResponse.ok) throw new Error("Failed to load members");
  if (!invitationsResponse.ok) throw new Error("Failed to load invitations");

  return {
    members: await membersResponse.json(),
    invitations: await invitationsResponse.json(),
  };
}

export function MembersManager({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  /**
   * Invite links, by address, for invitations created or reissued on this
   * screen. The server stores only a hash, so a link that is not held here
   * cannot be shown again — which is exactly why reissuing exists.
   */
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});

  /** Both lists, from one place, because most changes here move a row between them. */
  const reload = () =>
    fetchRoster().then(({ members, invitations }) => {
      setMembers(members);
      setInvitations(invitations);
    });

  useEffect(() => {
    let cancelled = false;

    fetchRoster()
      .then(({ members, invitations }) => {
        if (cancelled) return;
        setMembers(members);
        setInvitations(invitations);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) notify.error("Could not load members");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

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

  /** Reissues an invitation: a new token, a new fortnight, another email. */
  const resend = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      const response = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [invitation.email],
          role: invitation.role,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not resend");

      const [result] = (body.results ?? []) as InviteResult[];
      if (result?.outcome === "failed") throw new Error(result.error);

      if (result?.inviteUrl) {
        setFreshLinks((prev) => ({ ...prev, [result.email]: result.inviteUrl! }));
      }
      // The expiry moved, and an "added" outcome means they are a member now.
      await reload();

      if (result?.outcome === "added") {
        notify.success(`${invitation.email} was already signed up — let in`);
      } else if (result?.emailed) {
        notify.success(`Invitation resent to ${invitation.email}`);
      } else {
        notify.success(
          "Invitation reissued",
          "No email went out — copy the link and send it yourself."
        );
      }
    } catch (error) {
      notify.error(
        "Could not resend",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setBusyId(null);
    }
  };

  const revoke = async (invitation: Invitation) => {
    const before = invitations;
    setInvitations((prev) => prev.filter((row) => row.id !== invitation.id));

    try {
      const response = await fetch(`/api/invitations/${invitation.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Revoke failed");
      notify.success(
        "Invitation revoked",
        `The link sent to ${invitation.email} no longer works.`
      );
    } catch {
      setInvitations(before);
      notify.error("Could not revoke that invitation");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <Skeleton className="h-32 w-full" />
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
        {/* CardHeader is a grid; CardAction is the slot that keeps the button
            beside the title instead of stretched underneath it. */}
        <CardHeader>
          <CardTitle>Invite people</CardTitle>
          <CardDescription>
            An invitation is its own approval — whoever opens the link goes
            straight in. An address that already signed up is simply let in.
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setIsInviting(true)}
            >
              <UserPlus className="h-4 w-4" />
              Invite people
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          {invitations.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nothing outstanding. Invitations appear here until they&rsquo;re
              accepted.
            </p>
          ) : (
            invitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                link={freshLinks[invitation.email]}
                busy={busyId === invitation.id}
                onResend={() => resend(invitation)}
                onRevoke={() => revoke(invitation)}
              />
            ))
          )}
        </CardContent>
      </Card>

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

      <InviteDialog
        open={isInviting}
        onOpenChange={setIsInviting}
        onSent={() => {
          // An invite can add an existing sign-up as well as create an
          // invitation, so both lists are stale.
          reload().catch((error) => console.error(error));
        }}
      />
    </div>
  );
}

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

function InvitationRow({
  invitation,
  link,
  busy,
  onResend,
  onRevoke,
}: {
  invitation: Invitation;
  /** Only present when this screen created or reissued it. */
  link?: string;
  busy: boolean;
  onResend: () => void;
  onRevoke: () => void;
}) {
  const { expired } = invitation;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Mail className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{invitation.email}</p>
            {invitation.role === "ADMIN" && (
              <Badge variant="secondary" className="text-[10px]">Admin</Badge>
            )}
            {expired && (
              <Badge variant="outline" className="text-[10px]">Expired</Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {invitation.invitedBy
              ? `Invited by ${displayName(invitation.invitedBy)}`
              : "Invited"}
            {" · sent "}
            {shortDate(invitation.createdAt)}
            {expired ? " · link no longer works" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onResend}
          >
            <RefreshCw className="mr-1 h-4 w-4" />
            {expired ? "Send again" : "Resend"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={onRevoke}
          >
            <X className="mr-1 h-4 w-4" />
            Revoke
          </Button>
        </div>
      </div>

      {link && (
        <div className="mt-2 pl-12">
          <CopyLink url={link} />
        </div>
      )}
    </div>
  );
}

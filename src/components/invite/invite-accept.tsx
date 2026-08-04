"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, MailCheck, ShieldCheck, Link2Off, UserPlus } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";

/**
 * The invitation screen, in one component because the states are one flow:
 *
 *   sign-up       no account on the invited address yet — create one
 *   accept        signed in as the invited address — one button
 *   wrong-account signed in as somebody else
 *   expired/used/invalid  nothing to do but say so
 *
 * The email field is fixed rather than editable. The invitation is *for* an
 * address; letting it be typed over would only produce an account that cannot
 * accept it, and the server would refuse anyway.
 */

export type InviteState =
  | "sign-up"
  | "accept"
  | "wrong-account"
  | "expired"
  | "used"
  | "invalid";

export function InviteAccept({
  state,
  token,
  email,
  inviter,
  asAdmin = false,
  signedInAs,
}: {
  state: InviteState;
  token: string;
  email?: string;
  inviter?: string;
  asAdmin?: boolean;
  signedInAs?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  /** Claims the invitation for whoever is signed in. */
  const accept = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not accept");

      router.push("/board");
      // The dashboard layout reads the session's status on the server, and it
      // has just changed.
      router.refresh();
    } catch (accepting) {
      setError(
        accepting instanceof Error ? accepting.message : "Could not accept"
      );
      setIsBusy(false);
    }
  };

  const signUpThenAccept = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;

    setIsBusy(true);
    setError(null);

    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        // Back to this page after confirming, so the invitation is still in
        // hand. If the redirect drops the parameter, the link in the invitation
        // email leads here too — one extra click, same destination.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/invite/${token}`,
      },
    });

    if (authError) {
      setError(authError.message);
      setIsBusy(false);
      return;
    }

    // No session means confirmation is switched on for this project, so there
    // is nothing to accept with yet.
    if (!data.session) {
      setNeedsConfirmation(true);
      setIsBusy(false);
      return;
    }

    await accept();
  };

  if (needsConfirmation) {
    return (
      <Shell
        icon={<MailCheck className="h-6 w-6 text-muted-foreground" />}
        title="Check your email"
        description={
          <>
            We sent a confirmation link to <strong>{email}</strong>. Open it and
            you will land back here to finish joining.
          </>
        }
      >
        <Link href="/login" className="block">
          <Button variant="outline" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </Shell>
    );
  }

  if (state === "invalid" || state === "used" || state === "expired") {
    const copy = {
      invalid: {
        title: "This link isn't valid",
        description:
          "Check that you copied the whole link from the email, or ask for a new invitation.",
      },
      used: {
        title: "This invitation has been used",
        description:
          "The account it created already exists — sign in with it instead.",
      },
      expired: {
        title: "This invitation has expired",
        description: `Invitations are good for a fortnight. Ask ${
          inviter ?? "an administrator"
        } to send another.`,
      },
    }[state];

    return (
      <Shell
        icon={<Link2Off className="h-6 w-6 text-muted-foreground" />}
        title={copy.title}
        description={copy.description}
      >
        <Link href="/login" className="block">
          <Button variant="outline" className="w-full">
            Go to sign in
          </Button>
        </Link>
      </Shell>
    );
  }

  if (state === "wrong-account") {
    return (
      <Shell
        icon={<Link2Off className="h-6 w-6 text-muted-foreground" />}
        title="Signed in as someone else"
        description={
          <>
            This invitation is for <strong>{email}</strong>, but you are signed
            in as <strong>{signedInAs}</strong>. Sign out and open the link
            again.
          </>
        }
      >
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </Shell>
    );
  }

  const invitedBy = (
    <>
      <strong>{inviter}</strong> invited <strong>{email}</strong> to their
      TaskFlow workspace.
    </>
  );

  if (state === "accept") {
    return (
      <Shell
        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
        title="You're invited"
        description={invitedBy}
        badge={asAdmin ? "As an administrator" : undefined}
      >
        {error && <Problem>{error}</Problem>}
        <Button className="w-full" disabled={isBusy} onClick={accept}>
          {isBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Accept invitation
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      icon={<UserPlus className="h-6 w-6 text-primary" />}
      title="You're invited"
      description={invitedBy}
      badge={asAdmin ? "As an administrator" : undefined}
    >
      <form onSubmit={signUpThenAccept} className="space-y-4">
        {error && <Problem>{error}</Problem>}

        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          {/* Fixed: the invitation is for this address and no other. */}
          <Input id="invite-email" value={email ?? ""} readOnly disabled />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-name">Your name</Label>
          <Input
            id="invite-name"
            autoFocus
            placeholder="Ada Lovelace"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-password">Choose a password</Label>
          <Input
            id="invite-password"
            type="password"
            placeholder="••••••••"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={isBusy}>
          {isBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {isBusy ? "Setting up…" : "Join the workspace"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login?next=/invite/${token}`}
          className="text-primary hover:underline"
        >
          Sign in
        </Link>{" "}
        and you&rsquo;ll come back here.
      </p>
    </Shell>
  );
}

function Shell({
  icon,
  title,
  description,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {icon}
          </div>
          <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
          {badge && (
            <div className="mt-2 flex justify-center">
              <Badge variant="secondary">{badge}</Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-red-50 p-3 text-sm text-red-500 dark:bg-red-950/30">
      {children}
    </div>
  );
}

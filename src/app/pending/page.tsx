import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, ShieldX } from "lucide-react";
import { getAppUser } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";

export default async function PendingPage() {
  const user = await getAppUser();

  if (!user) redirect("/login");
  if (user.status === "ACTIVE") redirect("/board");

  const rejected = user.status === "REJECTED";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {rejected ? (
              <ShieldX className="h-6 w-6 text-destructive" />
            ) : (
              <Clock className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold">
            {rejected ? "Access declined" : "Waiting for approval"}
          </CardTitle>
          <CardDescription>
            {rejected ? (
              <>
                An administrator declined access for{" "}
                <strong>{user.email}</strong>. Get in touch with them if you
                think this is a mistake.
              </>
            ) : (
              <>
                Your account <strong>{user.email}</strong> was created
                successfully. An administrator needs to approve it before you
                can see any tasks.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!rejected && (
            <form action="/pending" method="get">
              <Button type="submit" className="w-full">
                Check again
              </Button>
            </form>
          )}
          <form action={signOut}>
            <Button type="submit" variant="ghost" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { MembersManager } from "@/components/settings/members-manager";

export default async function SettingsPage() {
  const user = await getAppUser();

  // The sidebar hides the link for non-admins; this stops direct navigation.
  if (!user || user.status !== "ACTIVE") redirect("/pending");
  if (user.role !== "ADMIN") redirect("/board");

  return (
    <div className="h-full flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage who can access this workspace
        </p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <MembersManager currentUserId={user.id} />
      </div>
    </div>
  );
}

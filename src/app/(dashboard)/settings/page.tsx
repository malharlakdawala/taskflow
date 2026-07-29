import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth";
import { SettingsTabs } from "@/components/settings/settings-tabs";

/**
 * Settings is no longer admin-only.
 *
 * Managing members still is, but connecting your own terminal to the
 * workspace is nobody's business but yours — and gating the whole screen
 * behind an admin meant the MCP server could only ever be used by one person.
 */
export default async function SettingsPage() {
  const user = await getAppUser();

  if (!user || user.status !== "ACTIVE") redirect("/pending");

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="enter flex h-full flex-col">
      <div className="border-b p-6">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Manage who can access this workspace, and connect your tools"
            : "Connect your tools to this workspace"}
        </p>
      </div>
      <div className="flex-1 overflow-auto p-6">
        {/* The tab strip is client-side, but which tabs exist is decided on the
            server — a member never receives the members-management markup. */}
        <SettingsTabs
          isAdmin={isAdmin}
          userId={user.id}
          userEmail={user.email}
        />
      </div>
    </div>
  );
}

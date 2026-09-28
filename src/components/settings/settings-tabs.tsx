"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersManager } from "@/components/settings/members-manager";
import { McpConnection } from "@/components/settings/mcp-connection";
import { NotificationPreferences } from "@/components/settings/notification-preferences";

export function SettingsTabs({
  isAdmin,
  userId,
  userEmail,
  emailPreferences,
}: {
  isAdmin: boolean;
  userId: string;
  userEmail: string;
  emailPreferences: {
    emailOnAssigned: boolean;
    emailOnComment: boolean;
    emailOnDueSoon: boolean;
  };
}) {
  return (
    <Tabs defaultValue={isAdmin ? "members" : "notifications"} className="gap-4">
      <TabsList>
        {isAdmin && <TabsTrigger value="members">Members</TabsTrigger>}
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
      </TabsList>

      {isAdmin && (
        <TabsContent value="members">
          <MembersManager currentUserId={userId} />
        </TabsContent>
      )}
      <TabsContent value="notifications">
        <NotificationPreferences initial={emailPreferences} />
      </TabsContent>
      <TabsContent value="mcp">
        <McpConnection userEmail={userEmail} />
      </TabsContent>
    </Tabs>
  );
}

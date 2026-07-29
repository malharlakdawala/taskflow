"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersManager } from "@/components/settings/members-manager";
import { McpConnection } from "@/components/settings/mcp-connection";

/**
 * A member sees only the MCP tab, and with one tab a tab strip is noise — so
 * it collapses to the panel on its own.
 */
export function SettingsTabs({
  isAdmin,
  userId,
  userEmail,
}: {
  isAdmin: boolean;
  userId: string;
  userEmail: string;
}) {
  if (!isAdmin) return <McpConnection userEmail={userEmail} />;

  return (
    <Tabs defaultValue="members" className="gap-4">
      <TabsList>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="mcp">MCP</TabsTrigger>
      </TabsList>

      <TabsContent value="members">
        <MembersManager currentUserId={userId} />
      </TabsContent>
      <TabsContent value="mcp">
        <McpConnection userEmail={userEmail} />
      </TabsContent>
    </Tabs>
  );
}

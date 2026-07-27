import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { getAppUser } from "@/lib/auth";

/**
 * Single gate for the whole authenticated app. Runs on the server, so an
 * unapproved account never receives any task markup at all — and the sidebar
 * gets the current user without the client having to fetch it.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAppUser();

  if (!user) redirect("/login");
  if (user.status !== "ACTIVE") redirect("/pending");

  return (
    <div className="flex h-screen">
      <Sidebar user={user} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

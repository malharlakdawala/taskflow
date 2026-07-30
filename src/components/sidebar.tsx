"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, initialsFor, displayName } from "@/lib/utils";
import {
  LayoutDashboard,
  KanbanSquare,
  List,
  Calendar,
  FolderKanban,
  Settings,
  LogOut,
  Moon,
  Sun,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ProjectDot } from "@/components/projects/project-badge";
import { useProjects } from "@/lib/use-projects";
import { signOut } from "@/app/(auth)/actions";
import { useTheme } from "next-themes";
import type { SessionUser } from "@/lib/types";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Board", href: "/board", icon: KanbanSquare },
  { name: "List", href: "/list", icon: List },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Projects", href: "/projects", icon: FolderKanban },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { projects } = useProjects();

  // Archived projects leave the sidebar — that is what archiving is for.
  const activeProjects = projects.filter((project) => !project.archived);

  const isAdmin = user.role === "ADMIN";
  // Settings is for everyone now — members manage their own MCP tokens there.
  // The page itself decides which tabs they get.
  const links = [
    ...navigation,
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r bg-sidebar">
      {/* The wordmark is the conventional way back to the dashboard; the bell
          shares its row so notifications are reachable from every screen
          without costing the nav a slot. */}
      <div className="flex h-16 shrink-0 items-center border-b pr-2.5">
        <Link
          href="/"
          aria-label="TaskFlow home"
          className={cn(
            "group flex h-full min-w-0 flex-1 items-center gap-2.5 px-5",
            "transition-colors hover:bg-sidebar-accent/40",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
              "transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
            )}
          >
            <Zap className="h-4.5 w-4.5" fill="currentColor" strokeWidth={0} />
          </span>
          <span className="font-display truncate text-lg font-bold tracking-tight">
            TaskFlow
          </span>
        </Link>

        <NotificationBell />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {links.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/board" && pathname.startsWith("/tasks"));
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                "transition-colors duration-150",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
              )}
            >
              {/* Active marker doubles as the accent, so the label stays legible. */}
              <span
                className={cn(
                  "absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary transition-opacity",
                  isActive ? "opacity-100" : "opacity-0"
                )}
              />
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
              />
              {item.name}
            </Link>
          );
        })}

        {/* Each project's own shortcut into the list, filtered to it. Only
            rendered when there are projects, so a workspace that never uses
            them never sees an empty heading. */}
        {activeProjects.length > 0 && (
          <div className="pt-4">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Projects
            </p>
            {activeProjects.map((project) => (
              <Link
                key={project.id}
                href={`/list?project=${project.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm",
                  "text-muted-foreground transition-colors duration-150",
                  "hover:bg-sidebar-accent/50 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                )}
              >
                <ProjectDot color={project.color} />
                <span className="truncate">{project.name}</span>
                {project.taskCount > 0 && (
                  <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
                    {project.taskCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div className="space-y-1 border-t p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary ring-1 ring-primary/20">
            {initialsFor(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight">
              {displayName(user)}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isAdmin ? "Admin" : "Member"}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px]" />
          ) : (
            <Moon className="h-[18px] w-[18px]" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </Button>

        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

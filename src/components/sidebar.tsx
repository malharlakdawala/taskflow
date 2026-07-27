"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, initialsFor, displayName } from "@/lib/utils";
import {
  LayoutDashboard,
  KanbanSquare,
  List,
  Calendar,
  Settings,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { signOut } from "@/app/(auth)/actions";
import { useTheme } from "next-themes";
import type { SessionUser } from "@/lib/types";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Board", href: "/board", icon: KanbanSquare },
  { name: "List", href: "/list", icon: List },
  { name: "Calendar", href: "/calendar", icon: Calendar },
];

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const isAdmin = user.role === "ADMIN";
  const links = isAdmin
    ? [...navigation, { name: "Settings", href: "/settings", icon: Settings }]
    : navigation;

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center px-6 border-b">
        <h1 className="text-xl font-bold">TaskFlow</h1>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {links.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/board" && pathname.startsWith("/tasks"));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4 space-y-2">
        <div className="flex items-center gap-3 rounded-lg px-1 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initialsFor(user)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{displayName(user)}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          {isAdmin && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Admin
            </Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-3"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>

        <form action={signOut}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3"
          >
            <LogOut className="h-5 w-5" />
            Sign Out
          </Button>
        </form>
      </div>
    </div>
  );
}

import { cn, displayName, initialsFor } from "@/lib/utils";
import type { User } from "@/lib/types";

/** Avatar initials plus a name. The name was previously never rendered. */
export function UserChip({
  user,
  className,
  size = "sm",
  showEmail = false,
}: {
  user: User | null | undefined;
  className?: string;
  size?: "sm" | "md";
  showEmail?: boolean;
}) {
  if (!user) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        Unassigned
      </span>
    );
  }

  const avatar = size === "md" ? "h-8 w-8 text-xs" : "h-6 w-6 text-[10px]";

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt=""
          className={cn("shrink-0 rounded-full object-cover", avatar)}
        />
      ) : (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary",
            avatar
          )}
        >
          {initialsFor(user)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm">{displayName(user)}</span>
        {showEmail && (
          <span className="block truncate text-xs text-muted-foreground">
            {user.email}
          </span>
        )}
      </span>
    </span>
  );
}

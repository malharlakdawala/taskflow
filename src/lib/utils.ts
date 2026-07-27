import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

type NamedUser = { name?: string | null; email: string };

/** Falls back to the local part of the email when no name is set. */
export function displayName(user: NamedUser): string {
  const name = user.name?.trim();
  if (name) return name;
  return user.email.split("@")[0];
}

/**
 * Descriptions are stored as Tiptap HTML. Card and row previews need plain
 * text, otherwise the markup is rendered literally as "<p>hello</p>".
 */
export function toPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Up to two initials for avatar chips. */
export function initialsFor(user: NamedUser): string {
  const source = displayName(user);
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

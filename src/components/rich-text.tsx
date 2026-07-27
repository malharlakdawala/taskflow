import { cn } from "@/lib/utils";

/**
 * Renders stored rich text. Content is sanitised server-side on write (see
 * src/lib/sanitize.ts), so what reaches here is already an allow-listed subset
 * of HTML — never render arbitrary user input through this component.
 */
export function RichText({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  if (!html?.trim()) return null;

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-img:rounded-lg prose-img:border prose-img:max-w-full prose-img:h-auto prose-img:max-h-72 prose-img:object-contain",
        "prose-a:text-primary prose-pre:bg-muted prose-pre:text-foreground",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

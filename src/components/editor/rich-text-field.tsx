"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { RichText } from "@/components/rich-text";
import { cn, toPlainText } from "@/lib/utils";

/** Waited out before persisting, so typing isn't one request per keystroke. */
const SAVE_DELAY = 800;

/**
 * Rich text that reads as a document until you choose to edit it.
 *
 * The task page previously mounted a Tiptap editor permanently, so every
 * description sat inside a bordered input under a twenty-button toolbar. On a
 * long imported description that buries the content: the toolbar dominates, and
 * an editor surface reads as a form field rather than something to be read.
 *
 * Read mode renders the prose properly; clicking anywhere in it opens the
 * editor. Edits still autosave, so the Done button only returns you to reading
 * — navigating away mid-edit flushes rather than discarding.
 */
export function RichTextField({
  value,
  onSave,
  placeholder = "Start writing…",
  emptyLabel = "Add a description…",
  ariaLabel = "Edit description",
  className,
}: {
  value: string | null;
  onSave: (html: string) => void | Promise<unknown>;
  placeholder?: string;
  emptyLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  /** Bumped on each edit session so the editor remounts with the latest value. */
  const [session, setSession] = useState(0);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const html = pending.current;
    if (html === null) return;
    pending.current = null;

    setStatus("saving");
    await onSaveRef.current(html);
    setStatus("saved");
  }, []);

  // A pending edit must not be lost to a navigation or a tab close.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) void onSaveRef.current(pending.current);
    };
  }, []);

  const handleChange = (html: string) => {
    pending.current = html;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  };

  const close = async () => {
    await flush();
    setIsEditing(false);
  };

  const open = () => {
    setSession((n) => n + 1);
    setStatus("idle");
    setIsEditing(true);
  };

  if (!isEditing) {
    const hasContent = toPlainText(value).length > 0 || /<(img|table|hr|pre)\b/i.test(value ?? "");

    return (
      <div className={cn("group/field relative", className)}>
        <button
          type="button"
          onClick={open}
          aria-label={ariaLabel}
          className={cn(
            "block w-full cursor-text rounded-lg px-3 py-2 text-left",
            "-mx-3 -my-2 transition-colors",
            "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          )}
        >
          {hasContent ? (
            <RichText html={value} />
          ) : (
            <span className="text-sm text-muted-foreground">{emptyLabel}</span>
          )}
        </button>

        {/* Discoverability without permanent chrome: the affordance appears on
            hover and on keyboard focus, and is hidden from AT as the wrapping
            button already announces the action. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -top-1 right-0 flex items-center gap-1 rounded-md",
            "border bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm",
            "opacity-0 transition-opacity",
            "group-hover/field:opacity-100 group-focus-within/field:opacity-100"
          )}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </span>

        {status === "saved" && (
          <span className="sr-only" role="status">
            Saved
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={className}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          void close();
        }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void close();
        }
      }}
    >
      <TiptapEditor
        key={session}
        autoFocus
        content={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder}
        footer={
          <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {status === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving…
                </>
              ) : status === "saved" ? (
                <>
                  <Check className="h-3 w-3" />
                  Saved
                </>
              ) : (
                <>
                  <kbd className="rounded border bg-background px-1 font-sans text-[10px]">
                    Esc
                  </kbd>
                  to finish
                </>
              )}
            </span>
            <Button size="sm" variant="outline" onClick={() => void close()}>
              Done
            </Button>
          </div>
        }
      />
    </div>
  );
}

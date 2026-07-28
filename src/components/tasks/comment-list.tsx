"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { RichText } from "@/components/rich-text";
import { notify } from "@/lib/notify";
import { cn, displayName, initialsFor, toPlainText } from "@/lib/utils";
import type { Comment } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquarePlus } from "lucide-react";

interface CommentListProps {
  comments: Comment[];
  taskId: string;
  onCommentAdded: (comment: Comment) => void;
}

export function CommentList({ comments, taskId, onCommentAdded }: CommentListProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  /**
   * The composer stays collapsed until asked for. A full toolbar under every
   * thread made the page read as a form, and pushed the comments themselves
   * off-screen on a task with any real discussion.
   */
  const [isComposing, setIsComposing] = useState(false);
  // Remounts the editor after a successful post so it visibly clears.
  const [editorKey, setEditorKey] = useState(0);

  // An "empty" Tiptap document is still "<p></p>", so check the text content.
  const hasContent =
    toPlainText(newComment).length > 0 || /<img\b/i.test(newComment);

  const handleSubmitComment = async () => {
    if (!hasContent) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "Could not post comment");

      onCommentAdded(body);
      setNewComment("");
      setEditorKey((k) => k + 1);
      setIsComposing(false);
    } catch (error) {
      console.error("Failed to add comment:", error);
      notify.error(
        "Could not post comment",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const discard = () => {
    setNewComment("");
    setEditorKey((k) => k + 1);
    setIsComposing(false);
  };

  return (
    <div className="space-y-5">
      {comments.length > 0 && (
        <ol className="space-y-5">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/15">
                {initialsFor(comment.author)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold">
                    {displayName(comment.author)}
                  </span>
                  <time
                    dateTime={comment.createdAt}
                    title={new Date(comment.createdAt).toLocaleString()}
                    className="text-xs text-muted-foreground"
                  >
                    {formatDistanceToNow(new Date(comment.createdAt), {
                      addSuffix: true,
                    })}
                  </time>
                </div>
                {/* Rendered as rich text — previously the raw HTML string. */}
                <RichText html={comment.content} className="mt-1.5" />
              </div>
            </li>
          ))}
        </ol>
      )}

      {comments.length === 0 && !isComposing && (
        <p className="text-sm text-muted-foreground">
          No comments yet. Start the thread.
        </p>
      )}

      <div className={cn(comments.length > 0 && "border-t pt-4")}>
        {isComposing ? (
          <>
            <TiptapEditor
              key={editorKey}
              autoFocus
              content=""
              onChange={setNewComment}
              placeholder="Write a comment… you can paste or drag in images"
              className="min-h-[100px]"
            />
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!hasContent || isSubmitting}
                size="sm"
              >
                {isSubmitting && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {isSubmitting ? "Posting…" : "Post comment"}
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setIsComposing(true)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5",
              "text-left text-sm text-muted-foreground transition-colors",
              "hover:border-primary/40 hover:bg-muted/40 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            )}
          >
            <MessageSquarePlus className="h-4 w-4" />
            Write a comment…
          </button>
        )}
      </div>
    </div>
  );
}

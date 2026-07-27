"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { RichText } from "@/components/rich-text";
import { notify } from "@/lib/notify";
import { displayName, initialsFor, toPlainText } from "@/lib/utils";
import type { Comment } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

interface CommentListProps {
  comments: Comment[];
  taskId: string;
  onCommentAdded: (comment: Comment) => void;
}

export function CommentList({ comments, taskId, onCommentAdded }: CommentListProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {comments.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No comments yet</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initialsFor(comment.author)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {displayName(comment.author)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              {/* Previously printed the raw HTML string as text. */}
              <RichText html={comment.content} className="mt-1 text-sm" />
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t">
        <TiptapEditor
          key={editorKey}
          content=""
          onChange={setNewComment}
          placeholder="Write a comment… you can paste or drag in images"
          className="min-h-[100px]"
        />
        <div className="flex justify-end mt-2">
          <Button
            onClick={handleSubmitComment}
            disabled={!hasContent || isSubmitting}
            size="sm"
          >
            {isSubmitting ? "Posting…" : "Post Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

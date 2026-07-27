"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
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

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment }),
      });

      if (response.ok) {
        const comment = await response.json();
        onCommentAdded(comment);
        setNewComment("");
      }
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {comment.author.name?.charAt(0) || comment.author.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {comment.author.name || "Unnamed"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-1 text-sm prose prose-sm max-w-none">
                {typeof comment.content === 'string' 
                  ? comment.content 
                  : JSON.stringify(comment.content)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t">
        <TiptapEditor
          content={newComment}
          onChange={setNewComment}
          placeholder="Write a comment..."
          className="min-h-[100px]"
        />
        <div className="flex justify-end mt-2">
          <Button
            onClick={handleSubmitComment}
            disabled={!newComment.trim() || isSubmitting}
            size="sm"
          >
            {isSubmitting ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

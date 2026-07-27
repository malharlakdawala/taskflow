"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Trash2, Paperclip, Upload, X, Check, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { CommentList } from "@/components/tasks/comment-list";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { UserChip } from "@/components/tasks/user-chip";
import { notify } from "@/lib/notify";
import type { Attachment, Comment, Task } from "@/lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG, STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

/** Waited out before persisting the description, so typing isn't one request per keystroke. */
const DESCRIPTION_SAVE_DELAY = 800;

/** yyyy-mm-dd for <input type="date">, in local time. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [titleDraft, setTitleDraft] = useState("");
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchTask = async () => {
      try {
        const response = await fetch(`/api/tasks/${params.id}`);
        if (!response.ok) throw new Error("Not found");
        const data: Task = await response.json();
        if (!cancelled) {
          setTask(data);
          setTitleDraft(data.title);
        }
      } catch (error) {
        console.error("Failed to fetch task:", error);
        if (!cancelled) router.push("/board");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTask();
    return () => {
      cancelled = true;
    };
  }, [params.id, router]);

  // Flush any pending description save when leaving the page.
  useEffect(() => {
    return () => {
      if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    };
  }, []);

  const patch = useCallback(
    async (changes: Record<string, unknown>) => {
      if (!task) return;
      try {
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changes),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Update failed");
        setTask(body);
        return body as Task;
      } catch (error) {
        console.error("Failed to update task:", error);
        notify.error(
          "Could not save change",
          error instanceof Error ? error.message : undefined
        );
      }
    },
    [task]
  );

  const handleTitleCommit = async () => {
    const next = titleDraft.trim();
    if (!task || !next || next === task.title) {
      setTitleDraft(task?.title ?? "");
      return;
    }
    await patch({ title: next });
  };

  /** Debounced: Tiptap fires onChange on every keystroke. */
  const handleDescriptionChange = (content: string) => {
    if (!task) return;
    if (descriptionTimer.current) clearTimeout(descriptionTimer.current);
    setIsSavingDescription(true);

    descriptionTimer.current = setTimeout(async () => {
      await patch({ description: content });
      setIsSavingDescription(false);
    }, DESCRIPTION_SAVE_DELAY);
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm("Delete this task? This cannot be undone.")) return;

    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      router.push("/board");
    } catch (error) {
      console.error("Failed to delete task:", error);
      notify.error("Could not delete task");
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!task || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch(`/api/tasks/${task.id}/attachments`, {
          method: "POST",
          body,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Upload failed");

        setTask((prev) =>
          prev
            ? {
                ...prev,
                attachments: [...prev.attachments, payload as Attachment],
                attachmentCount: prev.attachmentCount + 1,
              }
            : prev
        );
      }
      notify.success(files.length > 1 ? "Files attached" : "File attached");
    } catch (error) {
      notify.error(
        "Could not attach file",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveAttachment = async (attachment: Attachment) => {
    try {
      const response = await fetch(`/api/attachments/${attachment.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Delete failed");
      setTask((prev) =>
        prev
          ? {
              ...prev,
              attachments: prev.attachments.filter((a) => a.id !== attachment.id),
              attachmentCount: Math.max(0, prev.attachmentCount - 1),
            }
          : prev
      );
    } catch {
      notify.error("Could not remove attachment");
    }
  };

  const handleCommentAdded = (comment: Comment) => {
    setTask((prev) =>
      prev
        ? {
            ...prev,
            comments: [comment, ...prev.comments],
            commentCount: prev.commentCount + 1,
          }
        : prev
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!task) return null;

  const statusConfig = STATUS_CONFIG[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-4 p-6 border-b">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mt-1 shrink-0"
            onClick={() => router.push("/board")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            {/* Editable in place — previously the title was fixed at creation. */}
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitleDraft(task.title);
                  e.currentTarget.blur();
                }
              }}
              aria-label="Task title"
              className="h-auto border-transparent bg-transparent px-2 py-1 text-2xl font-bold shadow-none hover:border-input focus-visible:border-input"
            />
            <div className="mt-1 flex items-center gap-2 px-2">
              <Badge variant="outline" className={statusConfig.color}>
                {statusConfig.label}
              </Badge>
              <Badge variant="outline" className={priorityConfig.color}>
                {priorityConfig.label}
              </Badge>
            </div>
          </div>
        </div>
        <Button variant="destructive" size="icon" onClick={handleDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Description</CardTitle>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {isSavingDescription ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3" />
                      Saved
                    </>
                  )}
                </span>
              </CardHeader>
              <CardContent>
                <TiptapEditor
                  content={task.description ?? ""}
                  onChange={handleDescriptionChange}
                  placeholder="Add a detailed description…"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Attachments ({task.attachments.length})</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploading ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-1 h-4 w-4" />
                  )}
                  Upload
                </Button>
              </CardHeader>
              <CardContent>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleUpload}
                />
                {task.attachments.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No files attached
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {task.attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex items-center gap-3 rounded-lg border p-2"
                      >
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 flex-1 truncate text-sm hover:underline"
                        >
                          {attachment.filename}
                        </a>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(attachment.fileSize / 1024).toFixed(0)} KB
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => handleRemoveAttachment(attachment)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Comments ({task.comments.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <CommentList
                  comments={task.comments}
                  taskId={task.id}
                  onCommentAdded={handleCommentAdded}
                />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    items={STATUS_ITEMS}
                    value={task.status}
                    onValueChange={(v) => v && patch({ status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BACKLOG">Backlog</SelectItem>
                      <SelectItem value="TODO">To Do</SelectItem>
                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                      <SelectItem value="IN_REVIEW">In Review</SelectItem>
                      <SelectItem value="DONE">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    items={PRIORITY_ITEMS}
                    value={task.priority}
                    onValueChange={(v) => v && patch({ priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">No Priority</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className="text-sm font-medium">Assignee</label>
                  <AssigneePicker
                    value={task.assigneeId}
                    onChange={(assigneeId) => patch({ assigneeId })}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="due">
                    Due Date
                  </label>
                  <Input
                    id="due"
                    type="date"
                    value={toDateInput(task.dueDate)}
                    onChange={(e) =>
                      patch({ dueDate: e.target.value || null })
                    }
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className="text-sm font-medium">Created by</label>
                  {task.createdBy ? (
                    <UserChip user={task.createdBy} showEmail />
                  ) : (
                    <p className="text-sm text-muted-foreground">Unknown</p>
                  )}
                  <p className="pt-1 text-xs text-muted-foreground">
                    {new Date(task.createdAt).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            {task.tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map((taskTag) => (
                      <Badge key={taskTag.id} variant="secondary">
                        {taskTag.tag.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

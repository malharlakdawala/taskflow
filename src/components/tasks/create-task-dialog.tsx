"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Paperclip, Upload, X, Loader2 } from "lucide-react";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { notify } from "@/lib/notify";
import type { Task, TaskStatus, TaskPriority } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

/** A file already in storage, waiting for the task to exist so it can be recorded. */
type PendingAttachment = {
  url: string;
  filename: string;
  fileSize: number;
  mimeType: string;
};

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskCreated: (task: Task) => void;
  /** Preselects the status, so "Add task" inside a list section lands there. */
  defaultStatus?: TaskStatus;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  onTaskCreated,
  defaultStatus,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? "TODO");
  const [priority, setPriority] = useState<TaskPriority>("NONE");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-sync when reopened from a different list section. Tracking the last
  // value avoids setting state on every render the effect happens to run in.
  const lastDefault = useRef(defaultStatus);
  useEffect(() => {
    if (open && defaultStatus && lastDefault.current !== defaultStatus) {
      lastDefault.current = defaultStatus;
      setStatus(defaultStatus);
    }
  }, [open, defaultStatus]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setStatus(defaultStatus ?? "TODO");
    setPriority("NONE");
    setDueDate("");
    setAssigneeId(null);
    setAttachments([]);
    setEditorKey((k) => k + 1);
  };

  /**
   * Files upload as soon as they are chosen, because the task they belong to
   * does not exist yet; they are recorded against it after creation.
   */
  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of files) {
        const body = new FormData();
        body.append("file", file);
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Upload failed");

        setAttachments((prev) => [
          ...prev,
          {
            url: payload.url,
            filename: payload.filename,
            fileSize: payload.fileSize,
            mimeType: payload.mimeType || "application/octet-stream",
          },
        ]);
      }
    } catch (error) {
      notify.error(
        "Could not upload file",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          status,
          priority,
          dueDate: dueDate || null,
          assigneeId,
        }),
      });

      const task: Task = await response.json();
      if (!response.ok) {
        throw new Error(
          (task as { error?: string })?.error ?? "Could not create task"
        );
      }

      // Record any files uploaded before the task had an id.
      if (attachments.length > 0) {
        const saved = await Promise.all(
          attachments.map(async (attachment) => {
            const res = await fetch(`/api/tasks/${task.id}/attachments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(attachment),
            });
            return res.ok ? await res.json() : null;
          })
        );
        const attached = saved.filter(Boolean);
        task.attachments = attached;
        task.attachmentCount = attached.length;

        if (attached.length < attachments.length) {
          notify.error(
            "Some files could not be attached",
            "The task was created; add them again from the task page."
          );
        }
      }

      onTaskCreated(task);
      reset();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create task:", error);
      notify.error(
        "Could not create task",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Add formatting, images and files here — no need to open the task
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Task title"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label>Description</Label>
              <TiptapEditor
                key={editorKey}
                content=""
                onChange={setDescription}
                placeholder="Describe the task… paste or drag in images"
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>Attachments</Label>
                <Button
                  type="button"
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
                  Add files
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                onChange={handleFiles}
              />
              {attachments.length > 0 && (
                <ul className="space-y-1">
                  {attachments.map((attachment) => (
                    <li
                      key={attachment.url}
                      className="flex items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {attachment.filename}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {(attachment.fileSize / 1024).toFixed(0)} KB
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() =>
                          setAttachments((prev) =>
                            prev.filter((a) => a.url !== attachment.url)
                          )
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  items={STATUS_ITEMS}
                  value={status}
                  onValueChange={(v) => v && setStatus(v as TaskStatus)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
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
              <div className="grid gap-2">
                <Label>Priority</Label>
                <Select
                  items={PRIORITY_ITEMS}
                  value={priority}
                  onValueChange={(v) => v && setPriority(v as TaskPriority)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
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
              <div className="grid gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Assignee</Label>
                <AssigneePicker
                  value={assigneeId}
                  onChange={setAssigneeId}
                  placeholder="Me"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              disabled={isLoading || isUploading || !title.trim()}
            >
              {isLoading ? "Creating…" : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

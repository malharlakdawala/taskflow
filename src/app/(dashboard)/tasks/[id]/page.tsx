"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Lightbox } from "@/components/ui/lightbox";
import {
  ArrowLeft,
  Trash2,
  Paperclip,
  Upload,
  X,
  Loader2,
  AlignLeft,
  MessageSquare,
  FileText,
  CalendarClock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RichTextField } from "@/components/editor/rich-text-field";
import { CommentList } from "@/components/tasks/comment-list";
import { AssigneePicker } from "@/components/tasks/assignee-picker";
import { UserChip } from "@/components/tasks/user-chip";
import { StatusBadge, PriorityBadge, StatusDot } from "@/components/tasks/status-badge";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import type { Attachment, Comment, Task } from "@/lib/types";
import { STATUS_ITEMS, PRIORITY_ITEMS } from "@/lib/types";

/**
 * The path this browser tab first loaded, captured once per document.
 *
 * If it still matches the task we're on, the user arrived by pasting the link
 * and there is no in-app history behind us — router.back() would take them out
 * of the app entirely. Comparing against it tells the two cases apart without
 * relying on document.referrer, which client-side navigation never updates.
 */
const ENTRY_PATH =
  typeof window === "undefined" ? null : window.location.pathname;

/** yyyy-mm-dd for <input type="date">, in local time. */
function toDateInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

const FIELD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  /** Index into the image attachments, or null when the viewer is closed. */
  const [viewing, setViewing] = useState<number | null>(null);

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
        // Redirecting swallowed the reason. An explicit state lets the user
        // decide where to go instead of being bounced to the board.
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTask();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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

  const handleDelete = async () => {
    if (!task) return;
    try {
      const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      notify.success("Task deleted");
      router.push("/board");
    } catch (error) {
      console.error("Failed to delete task:", error);
      notify.error("Could not delete task");
    }
  };

  const uploadFiles = async (files: File[]) => {
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

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await uploadFiles(files);
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

  if (isLoading) return <DetailSkeleton />;

  if (notFound || !task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </span>
        <h1 className="font-display text-lg font-semibold">Task not found</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or the link is out of date.
        </p>
        {/* Base UI composes via `render`, not Radix's asChild. */}
        <Button
          variant="outline"
          className="mt-1"
          render={<Link href="/board" />}
        >
          Back to board
        </Button>
      </div>
    );
  }

  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = due !== null && due < new Date() && task.status !== "DONE";

  // Images open in the viewer so they can be zoomed, and step through each
  // other while it is open. Anything else is a file, and still opens as one.
  const imageAttachments = task.attachments.filter((attachment) =>
    attachment.mimeType.startsWith("image/")
  );

  return (
    <div className="enter flex h-full flex-col">
      {/* Sticky so status and title stay reachable while reading a long
          description; the detail page is the one screen that really scrolls. */}
      <header
        data-status={task.status}
        className="sticky top-0 z-20 border-b bg-card/80 px-6 py-4 backdrop-blur-md"
      >
        {/* The task's status colour, carried through from board and list. */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 bg-[var(--tone)]"
        />

        <nav
          aria-label="Breadcrumb"
          className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Link
            href="/board"
            className="rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Board
          </Link>
          <span aria-hidden>/</span>
          <span className="flex items-center gap-1.5 text-foreground">
            <StatusDot status={task.status} />
            {STATUS_ITEMS[task.status]}
          </span>
        </nav>

        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {/* A real link, so middle-click and "open in new tab" behave, but a
                plain click prefers going back — returning the user to the list
                or calendar they came from rather than always the board. The
                decision is made at click time; deriving it during render would
                mean reading browser history in an effect. */}
            <Button
              variant="ghost"
              size="icon"
              className="mt-0.5 shrink-0"
              aria-label="Go back"
              render={<Link href="/board" />}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                if (ENTRY_PATH !== window.location.pathname) {
                  event.preventDefault();
                  router.back();
                }
              }}
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
                className={cn(
                  "font-display h-auto rounded-lg border-transparent bg-transparent px-2 py-1",
                  "text-2xl font-bold leading-tight tracking-tight shadow-none",
                  "hover:bg-muted/60 focus-visible:border-input focus-visible:bg-background"
                )}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2 px-2">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
                {task.assignee && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <UserChip user={task.assignee} />
                  </>
                )}
                {due && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-medium",
                        isOverdue ? "text-destructive" : "text-muted-foreground"
                      )}
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                      {isOverdue ? "Overdue · " : "Due "}
                      {due.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsConfirmingDelete(true)}
            aria-label="Delete task"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlignLeft className="h-4 w-4 text-muted-foreground" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RichTextField
                  value={task.description}
                  onSave={(html) => patch({ description: html })}
                  placeholder="Add a detailed description…"
                  emptyLabel="No description yet — click to add one."
                />
              </CardContent>
            </Card>

            <Card
              onDragOver={(e) => {
                e.preventDefault();
                setIsDropTarget(true);
              }}
              onDragLeave={() => setIsDropTarget(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDropTarget(false);
                void uploadFiles(Array.from(e.dataTransfer.files));
              }}
              className={cn(
                "transition-colors",
                isDropTarget && "border-primary/50 bg-primary/5"
              )}
            >
              {/* CardHeader is a grid — `flex-row` never applied, so the Add
                  button stretched across the card. CardAction is its slot. */}
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  Attachments
                  <Count value={task.attachments.length} />
                </CardTitle>
                {task.attachments.length > 0 && (
                  <CardAction>
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
                      Add
                    </Button>
                  </CardAction>
                )}
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
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">
                      {isUploading ? "Uploading…" : "Drop files here"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      or click to browse
                    </span>
                  </button>
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {task.attachments.map((attachment) => {
                      const imageIndex = imageAttachments.indexOf(attachment);
                      const isImage = imageIndex !== -1;

                      const tile = (
                        <>
                          {/* Images preview; everything else gets an icon tile. */}
                          <div className="flex h-24 items-center justify-center overflow-hidden bg-muted/60">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={attachment.url}
                                alt={attachment.filename}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <FileText className="h-7 w-7 text-muted-foreground" />
                            )}
                          </div>
                          <div className="px-2 py-1.5 text-left">
                            <p className="truncate text-xs font-medium">
                              {attachment.filename}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {(attachment.fileSize / 1024).toFixed(0)} KB
                            </p>
                          </div>
                        </>
                      );

                      const tileClass =
                        "lift block w-full overflow-hidden rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

                      return (
                        <li key={attachment.id} className="group relative">
                          {isImage ? (
                            <button
                              type="button"
                              onClick={() => setViewing(imageIndex)}
                              aria-label={`View ${attachment.filename}`}
                              className={cn(tileClass, "cursor-zoom-in")}
                            >
                              {tile}
                            </button>
                          ) : (
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={tileClass}
                            >
                              {tile}
                            </a>
                          )}
                          <button
                            type="button"
                            aria-label={`Remove ${attachment.filename}`}
                            onClick={() => setPendingRemoval(attachment)}
                            className="absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  Comments
                  <Count value={task.comments.length} />
                </CardTitle>
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

          <div className="space-y-5 lg:sticky lg:top-28 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Status</label>
                  <Select
                    items={STATUS_ITEMS}
                    value={task.status}
                    onValueChange={(v) => v && patch({ status: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_ITEMS) as Array<keyof typeof STATUS_ITEMS>).map(
                        (value) => (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-2">
                              <StatusDot status={value as Task["status"]} />
                              {STATUS_ITEMS[value]}
                            </span>
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Priority</label>
                  <Select
                    items={PRIORITY_ITEMS}
                    value={task.priority}
                    onValueChange={(v) => v && patch({ priority: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(PRIORITY_ITEMS) as Array<keyof typeof PRIORITY_ITEMS>
                      ).map((value) => (
                        <SelectItem key={value} value={value}>
                          <PriorityBadge priority={value as Task["priority"]} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Assignee</label>
                  <AssigneePicker
                    value={task.assigneeId}
                    onChange={(assigneeId) => patch({ assigneeId })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    They get an email when assigned.
                  </p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className={FIELD_LABEL} htmlFor="due">
                    Due date
                  </label>
                  <Input
                    id="due"
                    type="date"
                    value={toDateInput(task.dueDate)}
                    onChange={(e) => patch({ dueDate: e.target.value || null })}
                    className={cn(isOverdue && "border-destructive/50 text-destructive")}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <label className={FIELD_LABEL}>Created by</label>
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
                  <CardTitle className="text-base">Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {task.tags.map((taskTag) => (
                      <span
                        key={taskTag.id}
                        className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
                      >
                        {taskTag.tag.name}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Lightbox
        images={imageAttachments.map((attachment) => ({
          src: attachment.url,
          alt: attachment.filename,
        }))}
        index={viewing}
        onIndexChange={setViewing}
        onClose={() => setViewing(null)}
      />

      <ConfirmDialog
        open={isConfirmingDelete}
        onOpenChange={setIsConfirmingDelete}
        title="Delete this task?"
        description={`"${task.title}" and its comments and attachments will be removed. This cannot be undone.`}
        confirmLabel="Delete task"
        destructive
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
        title="Remove this attachment?"
        description={pendingRemoval?.filename}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (pendingRemoval) await handleRemoveAttachment(pendingRemoval);
          setPendingRemoval(null);
        }}
      />
    </div>
  );
}

/** Small pill for the counts in card titles. */
function Count({ value }: { value: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

/** Mirrors the real layout so the page doesn't jump when data lands. */
function DetailSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-8 w-1/2" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>
      <div className="flex-1 p-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

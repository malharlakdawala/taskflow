import "server-only";

import { prisma } from "@/lib/prisma";
import { appUrl, isEmailConfigured, sendEmail } from "@/lib/email/client";
import {
  accountApprovedEmail,
  commentAddedEmail,
  dueSoonEmail,
  taskAssignedEmail,
  tasksAssignedEmail,
  type EmailBlock,
} from "@/lib/email/templates";
import {
  clip,
  commentPath,
  excerpt,
  quoted,
  recordNotifications,
  taskPath,
  type NotificationDraft,
} from "@/lib/notifications/record";
import { toPlainText } from "@/lib/utils";
import { PRIORITY_ITEMS, STATUS_ITEMS } from "@/lib/types";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

/**
 * Decides who hears about what, and over which channel.
 *
 * Every event lands in the in-app feed; only the ones worth interrupting
 * someone for also go out as email. Assignments, comments, approvals and the
 * due-date digest are mail-worthy. Field edits — a status nudge, a priority
 * bump, a date moved by a day — are not: those would turn the inbox into a
 * changelog, so they stay in the bell.
 *
 * Three rules run through everything here:
 *
 * 1. **Never notify someone about their own action.** Assigning a task to
 *    yourself or commenting on your own task should not ping you; that is
 *    the fastest way to get a notification system muted.
 * 2. **Never notify an inactive account.** A pending or rejected member cannot
 *    open the app, so a row in their feed is just dead weight.
 * 3. **Never let a failure surface.** These are called from `after()`, so a
 *    rejected send or insert must not turn a successful write into a 500.
 */

const nameFor = (user: { name: string | null; email: string }) =>
  user.name?.trim() || user.email.split("@")[0];

/** Absolute variant for email; the in-app feed stores relative paths. */
const taskUrl = (taskId: string) => `${appUrl()}${taskPath(taskId)}`;

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The subset of a task the roster rules care about. */
const RECIPIENT_SELECT = {
  id: true,
  email: true,
  name: true,
  status: true,
} as const;

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  status: "PENDING" | "ACTIVE" | "REJECTED";
};

/**
 * The people accountable for a task: whoever it is on, and whoever raised it.
 *
 * Deliberately not every past participant — on a task with a long thread that
 * turns into a mailing list.
 */
function interestedIn(
  task: { assignee: Recipient | null; createdBy: Recipient | null },
  actorId: string
): Recipient[] {
  const seen = new Set<string>([actorId]);
  return [task.assignee, task.createdBy].filter((user): user is Recipient => {
    if (!user || user.status !== "ACTIVE") return false;
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

/* -------------------------------------------------------------------------- */
/* Assignment                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tells a task's new assignee, in-app and by email.
 *
 * `previousAssigneeId` is compared so a PATCH that only touches the status does
 * not re-announce an assignment that hasn't changed.
 */
export async function notifyTaskAssigned({
  taskId,
  assigneeId,
  previousAssigneeId,
  actorId,
}: {
  taskId: string;
  assigneeId: string | null;
  previousAssigneeId: string | null;
  actorId: string;
}): Promise<void> {
  if (!assigneeId) return;
  if (assigneeId === previousAssigneeId) return;
  if (assigneeId === actorId) return;

  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          assignee: { select: RECIPIENT_SELECT },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);

    // A rejected or still-pending member should not be pulled into the app.
    if (!task?.assignee || task.assignee.status !== "ACTIVE") return;

    const actorName = actor ? nameFor(actor) : "Someone";

    const blocks: EmailBlock[] = [
      { label: "Status", value: STATUS_ITEMS[task.status] ?? task.status },
    ];
    if (task.priority !== "NONE") {
      blocks.push({
        label: "Priority",
        value: PRIORITY_ITEMS[task.priority] ?? task.priority,
      });
    }
    const due = formatDate(task.dueDate);
    if (due) blocks.push({ label: "Due", value: due });

    await recordNotifications([
      {
        userId: assigneeId,
        actorId,
        type: "TASK_ASSIGNED",
        title: `${actorName} assigned you ${quoted(task.title)}`,
        body: blocks.map(({ label, value }) => `${label}: ${value}`).join(" · "),
        url: taskPath(taskId),
        taskId,
      },
    ]);

    if (!isEmailConfigured()) return;

    const built = taskAssignedEmail({
      taskTitle: task.title,
      taskUrl: taskUrl(taskId),
      actorName,
      blocks,
    });

    await sendEmail({
      to: [{ email: task.assignee.email, name: task.assignee.name }],
      ...built,
      tags: ["task-assigned"],
    });
  } catch (error) {
    console.error("[notify] task-assigned failed:", error);
  }
}

/**
 * One digest for a bulk reassignment.
 *
 * `taskIds` should already be filtered to the tasks whose assignee actually
 * changed — the caller knows the previous values, and re-reading them here
 * would race against the update it follows.
 */
export async function notifyTasksAssigned({
  taskIds,
  assigneeId,
  actorId,
}: {
  taskIds: string[];
  assigneeId: string | null;
  actorId: string;
}): Promise<void> {
  if (!assigneeId || assigneeId === actorId || taskIds.length === 0) return;

  // A single reassignment reads better as the normal assignment notification.
  if (taskIds.length === 1) {
    return notifyTaskAssigned({
      taskId: taskIds[0],
      assigneeId,
      previousAssigneeId: null,
      actorId,
    });
  }

  try {
    const [assignee, actor, tasks] = await Promise.all([
      prisma.user.findUnique({
        where: { id: assigneeId },
        select: RECIPIENT_SELECT,
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
      prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!assignee || assignee.status !== "ACTIVE" || tasks.length === 0) return;

    const actorName = actor ? nameFor(actor) : "Someone";

    await recordNotifications([
      {
        userId: assigneeId,
        actorId,
        type: "TASK_ASSIGNED",
        title: `${actorName} assigned you ${tasks.length} tasks`,
        body: clip(tasks.map((task) => task.title).join(", "), 140),
        // No single task to open, so the list view is the useful destination.
        url: "/list",
      },
    ]);

    if (!isEmailConfigured()) return;

    const built = tasksAssignedEmail({
      items: tasks.map((task) => ({ title: task.title, url: taskUrl(task.id) })),
      appBoardUrl: `${appUrl()}/board`,
      actorName,
    });

    await sendEmail({
      to: [{ email: assignee.email, name: assignee.name }],
      ...built,
      tags: ["task-assigned", "bulk"],
    });
  } catch (error) {
    console.error("[notify] bulk-assignment failed:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Field edits                                                                 */
/* -------------------------------------------------------------------------- */

export interface TaskChange {
  label: string;
  value: string;
}

/** The fields worth telling someone about. `order` deliberately is not one. */
export interface TaskSnapshot {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
}

/**
 * What actually changed, in words.
 *
 * Only keys present in *both* snapshots are compared, so a caller that read
 * just the columns it was about to write does not report the rest as cleared.
 */
export function summarizeTaskChanges(
  before: TaskSnapshot,
  after: TaskSnapshot
): TaskChange[] {
  const changes: TaskChange[] = [];

  if (
    before.status !== undefined &&
    after.status !== undefined &&
    before.status !== after.status
  ) {
    changes.push({
      label: "Status",
      value: STATUS_ITEMS[after.status] ?? after.status,
    });
  }

  if (
    before.priority !== undefined &&
    after.priority !== undefined &&
    before.priority !== after.priority
  ) {
    changes.push({
      label: "Priority",
      value: PRIORITY_ITEMS[after.priority] ?? after.priority,
    });
  }

  if (before.dueDate !== undefined && after.dueDate !== undefined) {
    const from = before.dueDate?.getTime() ?? null;
    const to = after.dueDate?.getTime() ?? null;
    if (from !== to) {
      changes.push({
        label: "Due date",
        value: formatDate(after.dueDate) ?? "cleared",
      });
    }
  }

  if (
    before.title !== undefined &&
    after.title !== undefined &&
    before.title !== after.title
  ) {
    changes.push({ label: "Renamed to", value: clip(after.title) });
  }

  return changes;
}

/**
 * The same rendering without a comparison, for a write that applies one set of
 * values to many rows. Each row started somewhere different, but they all end
 * up here, so this — not any individual diff — is what the operation did.
 */
export function describeTaskValues(next: TaskSnapshot): TaskChange[] {
  const changes: TaskChange[] = [];

  if (next.status !== undefined) {
    changes.push({
      label: "Status",
      value: STATUS_ITEMS[next.status] ?? next.status,
    });
  }
  if (next.priority !== undefined) {
    changes.push({
      label: "Priority",
      value: PRIORITY_ITEMS[next.priority] ?? next.priority,
    });
  }
  if (next.dueDate !== undefined) {
    changes.push({
      label: "Due date",
      value: formatDate(next.dueDate ?? null) ?? "cleared",
    });
  }
  if (next.title !== undefined) {
    changes.push({ label: "Renamed to", value: clip(next.title) });
  }

  return changes;
}

const describe = (changes: TaskChange[]) =>
  changes.map(({ label, value }) => `${label} → ${value}`).join(" · ");

/**
 * A field edit on one task. In-app only — see the channel rule at the top.
 *
 * The caller passes the diff rather than the new row so this does not have to
 * guess which columns the request actually touched.
 */
export async function notifyTaskUpdated({
  taskId,
  changes,
  actorId,
}: {
  taskId: string;
  changes: TaskChange[];
  actorId: string;
}): Promise<void> {
  if (changes.length === 0) return;

  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          assignee: { select: RECIPIENT_SELECT },
          createdBy: { select: RECIPIENT_SELECT },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);
    if (!task) return;

    const recipients = interestedIn(task, actorId);
    if (recipients.length === 0) return;

    const actorName = actor ? nameFor(actor) : "Someone";
    const summary = describe(changes);

    await recordNotifications(
      recipients.map((user) => ({
        userId: user.id,
        actorId,
        type: "TASK_UPDATED" as const,
        title: `${actorName} updated ${quoted(task.title)}`,
        body: summary,
        url: taskPath(taskId),
        taskId,
      }))
    );
  } catch (error) {
    console.error("[notify] task-updated failed:", error);
  }
}

/**
 * The same field edit applied to many tasks at once, from the list view's bulk
 * bar. One notification per person, not one per task — a fifty-task status
 * sweep should cost each watcher a single line in their feed.
 */
export async function notifyTasksUpdated({
  taskIds,
  changes,
  actorId,
}: {
  taskIds: string[];
  changes: TaskChange[];
  actorId: string;
}): Promise<void> {
  if (changes.length === 0 || taskIds.length === 0) return;
  if (taskIds.length === 1) {
    return notifyTaskUpdated({ taskId: taskIds[0], changes, actorId });
  }

  try {
    const [tasks, actor] = await Promise.all([
      prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: {
          id: true,
          title: true,
          assignee: { select: RECIPIENT_SELECT },
          createdBy: { select: RECIPIENT_SELECT },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);

    // Who watches which of these tasks. Someone who only owns one of the fifty
    // should get a link to that one, not a vague "50 tasks changed".
    const byRecipient = new Map<string, { id: string; title: string }[]>();
    for (const task of tasks) {
      for (const user of interestedIn(task, actorId)) {
        const watched = byRecipient.get(user.id) ?? [];
        watched.push({ id: task.id, title: task.title });
        byRecipient.set(user.id, watched);
      }
    }
    if (byRecipient.size === 0) return;

    const actorName = actor ? nameFor(actor) : "Someone";
    const summary = describe(changes);

    const drafts: NotificationDraft[] = [];
    for (const [userId, watched] of byRecipient) {
      const single = watched.length === 1 ? watched[0] : null;
      drafts.push({
        userId,
        actorId,
        type: "TASK_UPDATED",
        title: single
          ? `${actorName} updated ${quoted(single.title)}`
          : `${actorName} updated ${watched.length} of your tasks`,
        body: single
          ? summary
          : `${summary} — ${clip(watched.map((task) => task.title).join(", "), 100)}`,
        url: single ? taskPath(single.id) : "/list",
        taskId: single?.id ?? null,
      });
    }

    await recordNotifications(drafts);
  } catch (error) {
    console.error("[notify] bulk-update failed:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Comments                                                                    */
/* -------------------------------------------------------------------------- */

/** Tells the assignee and the creator when someone else comments. */
export async function notifyCommentAdded({
  taskId,
  commentId,
  commentHtml,
  actorId,
}: {
  taskId: string;
  commentId: string;
  commentHtml: string;
  actorId: string;
}): Promise<void> {
  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          assignee: { select: RECIPIENT_SELECT },
          createdBy: { select: RECIPIENT_SELECT },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);
    if (!task) return;

    const recipients = interestedIn(task, actorId);
    if (recipients.length === 0) return;

    const actorName = actor ? nameFor(actor) : "Someone";

    await recordNotifications(
      recipients.map((user) => ({
        userId: user.id,
        actorId,
        type: "TASK_COMMENT" as const,
        title: `${actorName} commented on ${quoted(task.title)}`,
        body: excerpt(commentHtml),
        // Straight to the comment, not just the task — on a long thread the
        // difference is whether the link answers the question or starts a hunt.
        url: commentPath(taskId, commentId),
        taskId,
        commentId,
      }))
    );

    if (!isEmailConfigured()) return;

    const built = commentAddedEmail({
      taskTitle: task.title,
      taskUrl: `${appUrl()}${commentPath(taskId, commentId)}`,
      actorName,
      commentHtml,
      commentText: toPlainText(commentHtml),
    });

    await sendEmail({
      to: recipients.map(({ email, name }) => ({ email, name })),
      ...built,
      tags: ["task-comment"],
    });
  } catch (error) {
    console.error("[notify] comment failed:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Membership                                                                  */
/* -------------------------------------------------------------------------- */

/** Tells a newly approved member they can sign in. */
export async function notifyAccountApproved({
  memberId,
  approverId,
}: {
  memberId: string;
  approverId: string;
}): Promise<void> {
  if (memberId === approverId) return;

  try {
    const [member, approver] = await Promise.all([
      prisma.user.findUnique({
        where: { id: memberId },
        select: { email: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: approverId },
        select: { name: true, email: true },
      }),
    ]);
    if (!member) return;

    const approverName = approver ? nameFor(approver) : "An administrator";

    await recordNotifications([
      {
        userId: memberId,
        actorId: approverId,
        type: "ACCOUNT_APPROVED",
        title: "Your account was approved",
        body: `${approverName} let you into the workspace. Welcome to TaskFlow.`,
        url: "/",
      },
    ]);

    if (!isEmailConfigured()) return;

    const built = accountApprovedEmail({
      appHomeUrl: appUrl(),
      approverName,
    });

    await sendEmail({
      to: [{ email: member.email, name: member.name }],
      ...built,
      tags: ["account-approved"],
    });
  } catch (error) {
    console.error("[notify] approval failed:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Due dates                                                                   */
/* -------------------------------------------------------------------------- */

/** How far ahead a task counts as "due soon". */
const DUE_SOON_HOURS = 48;

/**
 * One email digest per assignee covering their tasks that are overdue or due
 * within the window, plus one in-app notification per task. Called from cron.
 *
 * Grouping the mail by person rather than by task is the difference between a
 * useful morning summary and twelve separate emails. The feed goes the other
 * way — a row per task, because each one needs its own link — but only for
 * tasks the person has not already been warned about and not yet acknowledged.
 * Without that check a task left overdue for a week would post seven identical
 * unread rows.
 */
export async function notifyDueSoon(): Promise<{
  recipients: number;
  tasks: number;
  sent: number;
  recorded: number;
}> {
  const now = new Date();
  const horizon = new Date(now.getTime() + DUE_SOON_HOURS * 3_600_000);

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { not: null, lte: horizon },
      status: { notIn: ["DONE"] },
      assignee: { is: { status: "ACTIVE" } },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      assignee: { select: { id: true, email: true, name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  if (tasks.length === 0) {
    return { recipients: 0, tasks: 0, sent: 0, recorded: 0 };
  }

  // Already-pending warnings, so a long-overdue task is not re-posted daily.
  const alreadyWarned = await prisma.notification.findMany({
    where: {
      type: "TASK_DUE_SOON",
      readAt: null,
      taskId: { in: tasks.map((task) => task.id) },
    },
    select: { userId: true, taskId: true },
  });
  const warned = new Set(
    alreadyWarned.map(({ userId, taskId }) => `${userId}:${taskId}`)
  );

  type Bucket = {
    email: string;
    name: string | null;
    overdue: Array<{ title: string; url: string; due: string }>;
    soon: Array<{ title: string; url: string; due: string }>;
  };
  const byAssignee = new Map<string, Bucket>();
  const drafts: NotificationDraft[] = [];

  for (const task of tasks) {
    if (!task.assignee || !task.dueDate) continue;
    const bucket =
      byAssignee.get(task.assignee.id) ??
      {
        email: task.assignee.email,
        name: task.assignee.name,
        overdue: [],
        soon: [],
      };

    const isOverdue = task.dueDate < now;
    const due = `${isOverdue ? "Was due" : "Due"} ${formatDate(task.dueDate)}`;
    (isOverdue ? bucket.overdue : bucket.soon).push({
      title: task.title,
      url: taskUrl(task.id),
      due,
    });
    byAssignee.set(task.assignee.id, bucket);

    if (!warned.has(`${task.assignee.id}:${task.id}`)) {
      drafts.push({
        userId: task.assignee.id,
        type: "TASK_DUE_SOON",
        title: `${quoted(task.title)} is ${isOverdue ? "overdue" : "due soon"}`,
        body: due,
        url: taskPath(task.id),
        taskId: task.id,
      });
    }
  }

  await recordNotifications(drafts);

  let sent = 0;
  if (isEmailConfigured()) {
    const boardUrl = `${appUrl()}/board`;

    for (const bucket of byAssignee.values()) {
      // Overdue is the more urgent framing, so it wins the subject line when
      // someone has both.
      const overdue = bucket.overdue.length > 0;
      const items = [...bucket.overdue, ...bucket.soon];
      const built = dueSoonEmail({ items, appBoardUrl: boardUrl, overdue });

      const ok = await sendEmail({
        to: [{ email: bucket.email, name: bucket.name }],
        ...built,
        tags: ["due-soon"],
      });
      if (ok) sent += 1;
    }
  }

  return {
    recipients: byAssignee.size,
    tasks: tasks.length,
    sent,
    recorded: drafts.length,
  };
}

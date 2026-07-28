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
import { toPlainText } from "@/lib/utils";
import { PRIORITY_ITEMS, STATUS_ITEMS } from "@/lib/types";

/**
 * Decides who is emailed and about what.
 *
 * Two rules run through everything here:
 *
 * 1. **Never notify someone about their own action.** Assigning a task to
 *    yourself or commenting on your own task should not send you mail; that is
 *    the fastest way to get a notification system muted.
 * 2. **Never let a send failure surface.** These are called from `after()`, so
 *    a rejected send must not turn a successful write into a 500.
 */

const nameFor = (user: { name: string | null; email: string }) =>
  user.name?.trim() || user.email.split("@")[0];

const taskUrl = (taskId: string) => `${appUrl()}/tasks/${taskId}`;

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return value.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Emails a task's new assignee.
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
  if (!isEmailConfigured()) return;
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
          assignee: { select: { email: true, name: true, status: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);

    // A rejected or still-pending member should not be pulled into the app.
    if (!task?.assignee || task.assignee.status !== "ACTIVE") return;

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

    const built = taskAssignedEmail({
      taskTitle: task.title,
      taskUrl: taskUrl(taskId),
      actorName: actor ? nameFor(actor) : "Someone",
      blocks,
    });

    await sendEmail({
      to: [{ email: task.assignee.email, name: task.assignee.name }],
      ...built,
      tags: ["task-assigned"],
    });
  } catch (error) {
    console.error("[email] task-assigned notification failed:", error);
  }
}

/**
 * Emails one digest for a bulk reassignment.
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
  if (!isEmailConfigured()) return;
  if (!assigneeId || assigneeId === actorId || taskIds.length === 0) return;

  // A single reassignment reads better as the normal assignment email.
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
        select: { email: true, name: true, status: true },
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

    const built = tasksAssignedEmail({
      items: tasks.map((task) => ({ title: task.title, url: taskUrl(task.id) })),
      appBoardUrl: `${appUrl()}/board`,
      actorName: actor ? nameFor(actor) : "Someone",
    });

    await sendEmail({
      to: [{ email: assignee.email, name: assignee.name }],
      ...built,
      tags: ["task-assigned", "bulk"],
    });
  } catch (error) {
    console.error("[email] bulk-assignment notification failed:", error);
  }
}

/**
 * Emails the assignee and the creator when someone else comments.
 *
 * Deliberately not every past participant: on a task with a long thread that
 * turns into a mailing list. Assignee and creator are the two people
 * accountable for it.
 */
export async function notifyCommentAdded({
  taskId,
  commentHtml,
  actorId,
}: {
  taskId: string;
  commentHtml: string;
  actorId: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;

  try {
    const [task, actor] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          assignee: { select: { id: true, email: true, name: true, status: true } },
          createdBy: { select: { id: true, email: true, name: true, status: true } },
        },
      }),
      prisma.user.findUnique({
        where: { id: actorId },
        select: { name: true, email: true },
      }),
    ]);
    if (!task) return;

    const seen = new Set<string>([actorId]);
    const recipients = [task.assignee, task.createdBy].filter(
      (user): user is NonNullable<typeof user> => {
        if (!user || user.status !== "ACTIVE") return false;
        if (seen.has(user.id)) return false;
        seen.add(user.id);
        return true;
      }
    );
    if (recipients.length === 0) return;

    const built = commentAddedEmail({
      taskTitle: task.title,
      taskUrl: taskUrl(taskId),
      actorName: actor ? nameFor(actor) : "Someone",
      commentHtml,
      commentText: toPlainText(commentHtml),
    });

    await sendEmail({
      to: recipients.map(({ email, name }) => ({ email, name })),
      ...built,
      tags: ["task-comment"],
    });
  } catch (error) {
    console.error("[email] comment notification failed:", error);
  }
}

/** Tells a newly approved member they can sign in. */
export async function notifyAccountApproved({
  memberId,
  approverId,
}: {
  memberId: string;
  approverId: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;
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

    const built = accountApprovedEmail({
      appHomeUrl: appUrl(),
      approverName: approver ? nameFor(approver) : "An administrator",
    });

    await sendEmail({
      to: [{ email: member.email, name: member.name }],
      ...built,
      tags: ["account-approved"],
    });
  } catch (error) {
    console.error("[email] approval notification failed:", error);
  }
}

/** How far ahead a task counts as "due soon". */
const DUE_SOON_HOURS = 48;

/**
 * One digest per assignee covering their tasks that are overdue or due within
 * the window. Called from the cron route.
 *
 * Grouping by person rather than sending one mail per task is the difference
 * between a useful morning summary and twelve separate emails.
 */
export async function notifyDueSoon(): Promise<{
  recipients: number;
  tasks: number;
  sent: number;
}> {
  if (!isEmailConfigured()) return { recipients: 0, tasks: 0, sent: 0 };

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

  type Bucket = {
    email: string;
    name: string | null;
    overdue: Array<{ title: string; url: string; due: string }>;
    soon: Array<{ title: string; url: string; due: string }>;
  };
  const byAssignee = new Map<string, Bucket>();

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
    const entry = {
      title: task.title,
      url: taskUrl(task.id),
      due: `${isOverdue ? "Was due" : "Due"} ${formatDate(task.dueDate)}`,
    };
    (isOverdue ? bucket.overdue : bucket.soon).push(entry);
    byAssignee.set(task.assignee.id, bucket);
  }

  let sent = 0;
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

  return { recipients: byAssignee.size, tasks: tasks.length, sent };
}

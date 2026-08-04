import "server-only";

/**
 * Email markup.
 *
 * Mail clients are not browsers: no external stylesheets, no custom properties,
 * no flexbox worth relying on. Everything here is inline styles on tables, and
 * every message ships a plain-text alternative so it stays readable in clients
 * that refuse HTML altogether.
 */

const BRAND = "#5b53d3";
const INK = "#1c1b22";
const MUTED = "#6b6a76";
const BORDER = "#e5e4ec";

export interface EmailBlock {
  /** Short label above the value, e.g. "Priority". */
  label: string;
  value: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wraps body content in the shared shell. `preheader` is the grey line mail
 * clients show next to the subject in the inbox list; left out, they scrape the
 * first words of the body instead, which reads as broken.
 */
function layout({
  preheader,
  heading,
  body,
  action,
  footer = "You are receiving this because you are a member of this TaskFlow workspace.",
}: {
  preheader: string;
  heading: string;
  body: string;
  action?: { label: string; url: string };
  /** Overridden by the invitation, which goes to someone who is not one yet. */
  footer?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f9;color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f9;padding:24px 12px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="height:4px;background:${BRAND};"></td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;">
            <p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${BRAND};">TaskFlow</p>
            <h1 style="margin:0 0 12px;font-size:19px;line-height:1.35;font-weight:700;color:${INK};">${escape(heading)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 8px;font-size:14px;line-height:1.6;color:${INK};">${body}</td>
        </tr>
        ${
          action
            ? `<tr>
          <td style="padding:16px 28px 28px;">
            <a href="${escape(action.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">${escape(action.label)}</a>
          </td>
        </tr>`
            : `<tr><td style="height:20px;"></td></tr>`
        }
        <tr>
          <td style="padding:16px 28px 22px;border-top:1px solid ${BORDER};font-size:12px;line-height:1.6;color:${MUTED};">
            ${escape(footer)}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Label/value rows — priority, due date and so on. */
function detailTable(blocks: EmailBlock[]): string {
  if (blocks.length === 0) return "";
  const rows = blocks
    .map(
      ({ label, value }) =>
        `<tr>
          <td style="padding:5px 12px 5px 0;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${MUTED};white-space:nowrap;vertical-align:top;">${escape(label)}</td>
          <td style="padding:5px 0;font-size:14px;color:${INK};">${escape(value)}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 8px;">${rows}</table>`;
}

function quote(html: string): string {
  return `<div style="margin:12px 0;padding:10px 14px;background:#f7f7fb;border-left:3px solid ${BORDER};border-radius:6px;font-size:14px;line-height:1.6;color:${INK};">${html}</div>`;
}

function textBlocks(blocks: EmailBlock[]): string {
  return blocks.map(({ label, value }) => `${label}: ${value}`).join("\n");
}

export function taskAssignedEmail({
  taskTitle,
  taskUrl,
  actorName,
  blocks,
}: {
  taskTitle: string;
  taskUrl: string;
  actorName: string;
  blocks: EmailBlock[];
}): BuiltEmail {
  return {
    subject: `${actorName} assigned you: ${taskTitle}`,
    html: layout({
      preheader: `${actorName} assigned you a task in TaskFlow.`,
      heading: taskTitle,
      body:
        `<p style="margin:0 0 4px;"><strong>${escape(actorName)}</strong> assigned this task to you.</p>` +
        detailTable(blocks),
      action: { label: "Open task", url: taskUrl },
    }),
    text: [
      `${actorName} assigned this task to you.`,
      "",
      taskTitle,
      textBlocks(blocks),
      "",
      taskUrl,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  };
}

/**
 * One email for a bulk reassignment. Sending a separate message per task would
 * mean fifty emails for one drag of the list view's bulk bar.
 */
export function tasksAssignedEmail({
  items,
  appBoardUrl,
  actorName,
}: {
  items: Array<{ title: string; url: string }>;
  appBoardUrl: string;
  actorName: string;
}): BuiltEmail {
  const heading = `${actorName} assigned you ${items.length} tasks`;
  const list = items
    .map(
      ({ title, url }) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
            <a href="${escape(url)}" style="color:${BRAND};text-decoration:none;font-weight:600;font-size:14px;">${escape(title)}</a>
          </td>
        </tr>`
    )
    .join("");

  return {
    subject: heading,
    html: layout({
      preheader: items.map((i) => i.title).join(", ").slice(0, 140),
      heading,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table>`,
      action: { label: "Open board", url: appBoardUrl },
    }),
    text: [
      heading,
      "",
      ...items.map(({ title, url }) => `- ${title}\n  ${url}`),
      "",
      appBoardUrl,
    ].join("\n"),
  };
}

export function commentAddedEmail({
  taskTitle,
  taskUrl,
  actorName,
  commentHtml,
  commentText,
}: {
  taskTitle: string;
  taskUrl: string;
  actorName: string;
  commentHtml: string;
  commentText: string;
}): BuiltEmail {
  return {
    subject: `${actorName} commented on: ${taskTitle}`,
    html: layout({
      preheader: commentText.slice(0, 140),
      heading: taskTitle,
      body:
        `<p style="margin:0;"><strong>${escape(actorName)}</strong> left a comment.</p>` +
        // Already sanitised on write, and sanitised again on read.
        quote(commentHtml),
      action: { label: "Reply in TaskFlow", url: taskUrl },
    }),
    text: [
      `${actorName} left a comment on "${taskTitle}":`,
      "",
      commentText,
      "",
      taskUrl,
    ].join("\n"),
  };
}

/**
 * An invitation to a workspace the recipient has no account on yet.
 *
 * Unlike every other message here this one goes to someone who has never heard
 * of TaskFlow, so it names the person inviting them and says what the thing is
 * — a bare "you have been invited" from an unknown product reads as spam.
 */
export function workspaceInviteEmail({
  inviteUrl,
  inviterName,
  inviterEmail,
  asAdmin,
  expiresLabel,
}: {
  inviteUrl: string;
  inviterName: string;
  inviterEmail: string;
  /** Admins can manage members, so it is worth saying up front. */
  asAdmin: boolean;
  expiresLabel: string;
}): BuiltEmail {
  const heading = `${inviterName} invited you to TaskFlow`;

  return {
    subject: heading,
    html: layout({
      preheader: `Set up your account and join ${inviterName}'s workspace.`,
      heading,
      body:
        `<p style="margin:0 0 10px;"><strong>${escape(inviterName)}</strong> (${escape(inviterEmail)}) ` +
        `has invited you to their TaskFlow workspace — a shared board for the team's tasks.</p>` +
        `<p style="margin:0 0 10px;">Open the link below to set a password and go straight in${
          asAdmin ? " as an administrator" : ""
        }. No approval needed; the invitation is already the approval.</p>` +
        `<p style="margin:0;color:${MUTED};">The link works once and expires ${escape(expiresLabel)}. ` +
        `If you weren't expecting this, you can ignore it.</p>`,
      action: { label: "Accept invitation", url: inviteUrl },
      footer: `You are receiving this because ${inviterEmail} entered your address in TaskFlow. Nobody can see your tasks unless you accept.`,
    }),
    text: [
      `${inviterName} (${inviterEmail}) has invited you to their TaskFlow workspace,`,
      "a shared board for the team's tasks.",
      "",
      `Open this link to set a password and join${asAdmin ? " as an administrator" : ""}:`,
      inviteUrl,
      "",
      `The link works once and expires ${expiresLabel}. If you weren't expecting`,
      "this, you can ignore it.",
    ].join("\n"),
  };
}

export function accountApprovedEmail({
  appHomeUrl,
  approverName,
}: {
  appHomeUrl: string;
  approverName: string;
}): BuiltEmail {
  return {
    subject: "Your TaskFlow account is approved",
    html: layout({
      preheader: "You can now sign in to TaskFlow.",
      heading: "You're in",
      body: `<p style="margin:0;"><strong>${escape(approverName)}</strong> approved your account. You can sign in and start working on tasks.</p>`,
      action: { label: "Open TaskFlow", url: appHomeUrl },
    }),
    text: [
      `${approverName} approved your TaskFlow account. You can now sign in.`,
      "",
      appHomeUrl,
    ].join("\n"),
  };
}

export function dueSoonEmail({
  items,
  appBoardUrl,
  overdue,
}: {
  items: Array<{ title: string; url: string; due: string }>;
  appBoardUrl: string;
  overdue: boolean;
}): BuiltEmail {
  const heading = overdue
    ? `${items.length} ${items.length === 1 ? "task is" : "tasks are"} overdue`
    : `${items.length} ${items.length === 1 ? "task is" : "tasks are"} due soon`;

  const list = items
    .map(
      ({ title, url, due }) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid ${BORDER};">
            <a href="${escape(url)}" style="color:${BRAND};text-decoration:none;font-weight:600;font-size:14px;">${escape(title)}</a>
            <div style="margin-top:2px;font-size:12px;color:${MUTED};">${escape(due)}</div>
          </td>
        </tr>`
    )
    .join("");

  return {
    subject: heading,
    html: layout({
      preheader: items.map((i) => i.title).join(", ").slice(0, 140),
      heading,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list}</table>`,
      action: { label: "Open board", url: appBoardUrl },
    }),
    text: [
      heading,
      "",
      ...items.map(({ title, due, url }) => `- ${title} (${due})\n  ${url}`),
      "",
      appBoardUrl,
    ].join("\n"),
  };
}

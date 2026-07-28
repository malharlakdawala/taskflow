import "server-only";

/**
 * Transactional email via Brevo's HTTP API.
 *
 * Chosen over the Vercel Marketplace's Resend listing because that starts at
 * $20/month; Brevo's free tier covers 300 emails a day, which is well beyond
 * what a team-sized task board sends. Plain fetch rather than an SDK — it is
 * one POST, and a dependency-free client keeps the function bundle small.
 *
 * Sending is always best-effort. Notifications must never fail the write that
 * triggered them: assigning a task has to succeed whether or not the mail goes
 * out, so every failure here is logged and swallowed.
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export type Recipient = { email: string; name?: string | null };

export interface EmailMessage {
  to: Recipient[];
  subject: string;
  html: string;
  text: string;
  /** Groups sends in Brevo's dashboard so bounces can be traced to a feature. */
  tags?: string[];
  replyTo?: Recipient;
}

function senderAddress(): string | null {
  return process.env.EMAIL_FROM_ADDRESS?.trim() || null;
}

/** True when the environment can actually send. Callers may skip work if not. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && senderAddress());
}

let warned = false;

/**
 * Absolute base URL for links in emails. A relative path is useless in a mail
 * client, so this has to resolve even when no explicit value is configured.
 */
export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  // Set automatically on Vercel; the production hostname, not the deployment's.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export async function sendEmail(message: EmailMessage): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const from = senderAddress();

  if (!apiKey || !from) {
    // Once per process, not once per send — a missing key would otherwise fill
    // the logs on every assignment.
    if (!warned) {
      warned = true;
      console.warn(
        "[email] BREVO_API_KEY or EMAIL_FROM_ADDRESS is not set; " +
          "notifications are disabled."
      );
    }
    return false;
  }

  const recipients = message.to.filter((r) => r.email);
  if (recipients.length === 0) return false;

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: from,
          name: process.env.EMAIL_FROM_NAME?.trim() || "TaskFlow",
        },
        to: recipients.map(({ email, name }) => ({
          email,
          ...(name ? { name } : {}),
        })),
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        ...(message.replyTo?.email ? { replyTo: message.replyTo } : {}),
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
    });

    if (!response.ok) {
      // Brevo returns { code, message } — worth surfacing verbatim, since the
      // usual cause is an unverified sender address and that is actionable.
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] Brevo rejected the send (${response.status}): ${detail.slice(0, 500)}`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("[email] Could not reach Brevo:", error);
    return false;
  }
}

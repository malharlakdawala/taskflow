"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail } from "lucide-react";
import { notify } from "@/lib/notify";

interface EmailPreferences {
  emailOnAssigned: boolean;
  emailOnComment: boolean;
  emailOnDueSoon: boolean;
}

const ROWS: Array<{
  key: keyof EmailPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "emailOnAssigned",
    label: "Assigned a task",
    description: "When someone hands you a task, or files one straight onto your plate.",
  },
  {
    key: "emailOnComment",
    label: "Comments on your tasks",
    description: "When someone comments on a task you're assigned to or created.",
  },
  {
    key: "emailOnDueSoon",
    label: "Due-date reminders",
    description: "The daily digest for tasks of yours that are overdue or due soon.",
  },
];

/**
 * Settings → Notifications.
 *
 * Every one of these only gates the *emailed* copy of an event — the in-app
 * feed always gets one, so turning everything off here still leaves the bell
 * working. Account approval and workspace invitations aren't listed: there's
 * no feed yet for that mail to fall back to.
 */
export function NotificationPreferences({
  initial,
}: {
  initial: EmailPreferences;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const toggle = async (key: keyof EmailPreferences, checked: boolean) => {
    const previous = prefs;
    setPrefs((p) => ({ ...p, [key]: checked }));
    setSavingKey(key);
    try {
      const response = await fetch("/api/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: checked }),
      });
      if (!response.ok) throw new Error("Update failed");
    } catch {
      setPrefs(previous);
      notify.error("Could not save preference");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" />
          Email notifications
        </CardTitle>
        <CardDescription>
          Choose what&rsquo;s worth an email. Everything still shows up in the bell.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ROWS.map((row) => (
          <label
            key={row.key}
            className="group flex items-start gap-3 rounded-lg border p-3 has-disabled:opacity-60"
          >
            <Checkbox
              className="mt-0.5"
              checked={prefs[row.key]}
              disabled={savingKey === row.key}
              onCheckedChange={(checked) => toggle(row.key, checked === true)}
            />
            <span>
              <span className="block text-sm font-medium">{row.label}</span>
              <span className="block text-xs text-muted-foreground">
                {row.description}
              </span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

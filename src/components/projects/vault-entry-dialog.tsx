"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { ProjectPicker } from "@/components/projects/project-picker";
import { Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import type { VaultEntry } from "@/lib/types";

interface VaultEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fixed project scope, when creating from that project's own vault page.
   * Omit it (workspace-wide vault view) to let the person choose from a
   * project picker instead — ProjectPicker already narrows that list to
   * projects they edit, the same bar the vault itself is gated at.
   */
  projectId?: string;
  /** Present when editing; null when creating a new entry. */
  entry: VaultEntry | null;
  onSaved: (entry: VaultEntry) => void;
}

export function VaultEntryDialog({
  open,
  onOpenChange,
  projectId,
  entry,
  onSaved,
}: VaultEntryDialogProps) {
  // Initialized once from `entry`, not re-synced via an effect — the parent
  // remounts this component (via `key`) each time it opens for a different
  // entry, or a fresh one, so these only ever need to be right on mount.
  // Password is deliberately never pre-filled on edit — the dialog can't
  // display a secret it was never sent in the first place.
  const [name, setName] = useState(entry?.name ?? "");
  const [username, setUsername] = useState(entry?.username ?? "");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState(entry?.url ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [isSaving, setIsSaving] = useState(false);

  // Fixed when editing (the entry's own project never changes here) or when
  // the parent already scoped this dialog to one project; otherwise chosen
  // from the picker below.
  const [targetProjectId, setTargetProjectId] = useState<string | null>(
    entry?.projectId ?? projectId ?? null
  );
  const showProjectPicker = entry === null && !projectId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!targetProjectId) return;
    setIsSaving(true);

    try {
      const isEdit = entry !== null;
      const response = await fetch(
        isEdit ? `/api/vault/${entry.id}` : `/api/projects/${targetProjectId}/vault`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            username: username || null,
            // Absent (not even an empty string) means "leave the password
            // alone" on an edit — see updateVaultEntrySchema's own note.
            ...(password ? { password } : {}),
            url: url || null,
            notes: notes || null,
          }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error ?? "Could not save credential");
      }

      onSaved(body as VaultEntry);
      onOpenChange(false);
    } catch (error) {
      notify.error(
        "Could not save credential",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit credential" : "Add credential"}</DialogTitle>
          <DialogDescription>
            {showProjectPicker
              ? "Only that project's editors can see or manage it."
              : "Only editors of this project can see or manage anything here."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {showProjectPicker && (
            <div className="grid gap-2">
              <Label htmlFor="vault-project">Project</Label>
              <ProjectPicker
                value={targetProjectId}
                onChange={setTargetProjectId}
                placeholder="Choose a project"
                allowNone={false}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="vault-name">Name</Label>
            <Input
              id="vault-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production database"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vault-username">Username</Label>
              <Input
                id="vault-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vault-password">
                Password{entry && <span className="text-muted-foreground"> (leave blank to keep)</span>}
              </Label>
              <Input
                id="vault-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={entry?.hasPassword ? "••••••••" : ""}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vault-url">URL</Label>
            <Input
              id="vault-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vault-notes">Notes</Label>
            <Textarea
              id="vault-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSaving || !name.trim() || !targetProjectId}>
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {entry ? "Save changes" : "Add credential"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

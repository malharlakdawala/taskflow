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
import { Check, Loader2 } from "lucide-react";
import { notify } from "@/lib/notify";
import { invalidateProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";
import {
  PROJECT_COLORS,
  PROJECT_COLOR_ITEMS,
  type Project,
  type ProjectColor,
} from "@/lib/types";

/**
 * Creates a project, or edits one when `project` is given. The two are the same
 * form with a different verb, so they are the same component — a separate edit
 * dialog would drift out of step with this one field by field.
 *
 * The fields initialise from `project` once and are never resynced, so callers
 * must pass a `key` that changes each time the dialog is opened. That is React's
 * own answer to "reset this form when the subject changes", and it avoids the
 * effect-that-calls-setState this used to need.
 */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  /** Optional: the shared cache is refreshed either way. */
  onSaved?: (project: Project) => void;
}) {
  const isEditing = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState<ProjectColor>(project?.color ?? "violet");
  const [isSaving, setIsSaving] = useState(false);
  // Duplicate names are a likely and correctable mistake, so the message lands
  // on the field rather than in a toast that disappears.
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSaving(true);
    setNameError(null);

    try {
      const response = await fetch(
        isEditing ? `/api/projects/${project!.id}` : "/api/projects",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            description: description.trim() || null,
            color,
          }),
        }
      );

      const body = await response.json();

      if (response.status === 409) {
        setNameError(body?.error ?? "That name is taken");
        return;
      }
      if (!response.ok) throw new Error(body?.error ?? "Could not save project");

      // The picker and sidebar read from the shared cache, so they need telling.
      invalidateProjects();
      onSaved?.(body as Project);
      notify.success(isEditing ? "Project updated" : `${trimmed} created`);
      onOpenChange(false);
    } catch (error) {
      notify.error(
        isEditing ? "Could not update project" : "Could not create project",
        error instanceof Error ? error.message : undefined
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Renaming a project updates it everywhere it appears."
              : "A project groups tasks together. Tasks can also belong to none."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setNameError(null);
                }}
                placeholder="Website redesign"
                maxLength={120}
                autoFocus
                required
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "project-name-error" : undefined}
              />
              {nameError && (
                <p id="project-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="project-description">
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this project covers"
                maxLength={2000}
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>Colour</Label>
              {/* A radiogroup rather than a select: eight swatches are faster to
                  choose from when you can see them all at once. */}
              <div role="radiogroup" aria-label="Project colour" className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={color === value}
                    aria-label={PROJECT_COLOR_ITEMS[value]}
                    title={PROJECT_COLOR_ITEMS[value]}
                    data-project-color={value}
                    onClick={() => setColor(value)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full bg-[var(--tone)]",
                      "transition-transform hover:scale-110",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2",
                      color === value && "ring-2 ring-ring/60 ring-offset-2"
                    )}
                  >
                    {color === value && (
                      <Check
                        className="h-4 w-4 text-white drop-shadow"
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !name.trim()}>
              {isSaving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isEditing ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

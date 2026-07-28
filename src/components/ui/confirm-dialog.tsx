"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

/**
 * Replaces window.confirm for destructive actions. The native dialog can't be
 * styled, is rendered by the browser chrome rather than the app, and blocks the
 * main thread — so a slow delete looks like a freeze.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [isRunning, setIsRunning] = useState(false);

  const handleConfirm = async () => {
    setIsRunning(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let a backdrop click abandon an in-flight request.
        if (isRunning) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isRunning}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            variant={destructive ? "destructive" : "default"}
            disabled={isRunning}
            onClick={handleConfirm}
          >
            {isRunning && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

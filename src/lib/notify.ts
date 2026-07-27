import { toast } from "@/components/ui/toast";

/** Thin wrapper so call sites don't repeat the toast manager's option shape. */
export const notify = {
  error(title: string, description?: string) {
    toast.add({ title, description, type: "error" });
  },
  success(title: string, description?: string) {
    toast.add({ title, description, type: "success" });
  },
};

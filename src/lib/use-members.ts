"use client";

import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

/**
 * The roster barely changes, so it is fetched once per page load and shared by
 * every picker. Without this, opening the create dialog and each task detail
 * view would each pay a fresh round-trip for the same list.
 */
let cache: Promise<User[]> | null = null;

function fetchMembers(): Promise<User[]> {
  cache ??= fetch("/api/users")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load members");
      return response.json() as Promise<User[]>;
    })
    .catch((error) => {
      cache = null; // let the next caller retry
      throw error;
    });
  return cache;
}

/** Drops the cached roster so the next read refetches (e.g. after approving someone). */
export function invalidateMembers() {
  cache = null;
}

export function useMembers() {
  const [members, setMembers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMembers()
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((error) => console.error("Failed to load members:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { members, isLoading };
}

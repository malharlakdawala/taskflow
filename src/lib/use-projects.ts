"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

/**
 * Shared project list, for the same reason use-members exists: the picker, the
 * sidebar and the board and list filters all want it, and without a cache each
 * would pay its own round-trip on every page load.
 *
 * Projects differ from the roster in one way that matters, though — they are
 * created from a dialog that can be two clicks away from a picker. So mounted
 * consumers are tracked and pushed the new list together, rather than each
 * holding a snapshot that goes stale the moment someone adds a project.
 */
let cache: Promise<Project[]> | null = null;
const subscribers = new Set<(projects: Project[]) => void>();

function fetchProjects(): Promise<Project[]> {
  cache ??= fetch("/api/projects")
    .then((response) => {
      if (!response.ok) throw new Error("Failed to load projects");
      return response.json() as Promise<Project[]>;
    })
    .catch((error) => {
      cache = null; // let the next caller retry
      throw error;
    });
  return cache;
}

/** Drops the cache and hands the fresh list to everything currently mounted. */
export function invalidateProjects() {
  cache = null;
  if (subscribers.size === 0) return;

  fetchProjects()
    .then((list) => {
      for (const receive of subscribers) receive(list);
    })
    .catch((error) => console.error("Failed to reload projects:", error));
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const receive = (list: Project[]) => {
      if (!cancelled) setProjects(list);
    };
    subscribers.add(receive);

    fetchProjects()
      .then(receive)
      .catch((error) => console.error("Failed to load projects:", error))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      subscribers.delete(receive);
    };
  }, []);

  return { projects, isLoading };
}

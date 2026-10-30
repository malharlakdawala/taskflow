"use client";

import { useEffect, useState } from "react";
import type { Phase } from "@/lib/types";

/**
 * One project's phases, cached per project the same way use-projects caches
 * the project list: several pickers on one screen should share a round-trip,
 * and the phases dialog pushes changes to every mounted consumer.
 */
const cache = new Map<string, Promise<Phase[]>>();
const subscribers = new Map<string, Set<(phases: Phase[]) => void>>();

function fetchPhases(projectId: string): Promise<Phase[]> {
  let pending = cache.get(projectId);
  if (!pending) {
    pending = fetch(`/api/projects/${projectId}/phases`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load phases");
        return response.json() as Promise<Phase[]>;
      })
      .catch((error) => {
        cache.delete(projectId); // let the next caller retry
        throw error;
      });
    cache.set(projectId, pending);
  }
  return pending;
}

/** Drops the project's cache and hands the fresh list to everything mounted. */
export function invalidatePhases(projectId: string) {
  cache.delete(projectId);
  const listeners = subscribers.get(projectId);
  if (!listeners?.size) return;

  fetchPhases(projectId)
    .then((list) => {
      for (const receive of listeners) receive(list);
    })
    .catch((error) => console.error("Failed to reload phases:", error));
}

/** Null `projectId` — an unfiled task — has no phases to offer. */
export function usePhases(projectId: string | null) {
  const [state, setState] = useState<{ projectId: string | null; phases: Phase[] }>({
    projectId: null,
    phases: [],
  });

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const receive = (list: Phase[]) => {
      if (!cancelled) setState({ projectId, phases: list });
    };

    let listeners = subscribers.get(projectId);
    if (!listeners) subscribers.set(projectId, (listeners = new Set()));
    listeners.add(receive);

    fetchPhases(projectId)
      .then(receive)
      .catch((error) => console.error("Failed to fetch phases:", error));

    return () => {
      cancelled = true;
      listeners.delete(receive);
    };
  }, [projectId]);

  // Results for a previous project are never shown against the current one.
  const current = projectId !== null && state.projectId === projectId;
  return {
    phases: current ? state.phases : [],
    isLoading: projectId !== null && !current,
  };
}

/**
 * Live cpu/mem for running containers. A single module-level poller is shared
 * by every subscriber (sidebar cards + detail tabs) via ref-counting: it
 * starts on the first `useContainerStats()` mount and stops when the last
 * unmounts, so `docker stats` runs at most once per interval and only while a
 * container surface is visible.
 */

import { useSyncExternalStore } from "react";
import { containersNative, containersWorkspace } from "./lib/native";
import type { ContainerRuntime, ContainerStats } from "./types";

const POLL_INTERVAL_MS = 2500;

export type StatsByKey = Map<string, ContainerStats>;

let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;
let snapshot: StatsByKey = new Map();
// Bumped on every workspace switch so a slow in-flight poll can't apply to the
// wrong host.
let generation = 0;
const listeners = new Set<() => void>();

export type StatsTarget = { runtime: ContainerRuntime; id: string };

/**
 * Running containers to poll, contributed by named sources (the sidebar panel
 * feeds all running; each detail stack feeds its active container). The poller
 * targets the deduped union so no source clobbers another's targets.
 */
const targetsBySource = new Map<string, StatsTarget[]>();
let targets: StatsTarget[] = [];

function recomputeTargets(): void {
  const seen = new Set<string>();
  const merged: StatsTarget[] = [];
  for (const list of targetsBySource.values()) {
    for (const t of list) {
      const k = rowKey(t.runtime, t.id);
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(t);
    }
  }
  targets = merged;
}

function emit(): void {
  for (const l of listeners) l();
}

function rowKey(runtime: string, id: string): string {
  return `${runtime}:${id}`;
}

async function pollOnce(): Promise<void> {
  if (inflight || targets.length === 0) return;
  inflight = true;
  const gen = generation;
  try {
    const results = await Promise.allSettled(
      targets.map((t) => containersNative.stats(t.runtime, t.id)),
    );
    if (gen !== generation) return; // workspace switched mid-poll
    const next: StatsByKey = new Map();
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const target = targets[i];
      // `docker stats <id>` returns one row; key it by our runtime:id.
      const row = r.value[0];
      if (row) next.set(rowKey(target.runtime, row.id), row);
    });
    snapshot = next;
    emit();
  } finally {
    inflight = false;
  }
}

function start(): void {
  if (timer) return;
  void pollOnce();
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

function stop(): void {
  if (timer) clearInterval(timer);
  timer = null;
  snapshot = new Map();
  targetsBySource.clear();
  targets = [];
}

/**
 * Update which running containers a given source wants polled. Sources are
 * merged (union) so the sidebar panel and any open detail stack coexist. Pass
 * an empty array to withdraw a source's targets.
 */
export function setStatsTargets(source: string, running: StatsTarget[]): void {
  // Reset all sources + the poll generation when the active workspace changes.
  const environment = containersWorkspace();
  const key = environment?.kind === "ssh"
    ? `ssh:${environment.connectionId}`
    : environment?.kind === "wsl"
      ? `wsl:${environment.distro}`
      : "local";
  if (key !== setStatsTargets.lastKey) {
    setStatsTargets.lastKey = key;
    generation += 1;
    targetsBySource.clear();
    snapshot = new Map();
    emit();
  }
  targetsBySource.set(source, running);
  recomputeTargets();
}
setStatsTargets.lastKey = "" as string;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  subscribers += 1;
  if (subscribers === 1) start();
  return () => {
    listeners.delete(cb);
    subscribers -= 1;
    if (subscribers === 0) stop();
  };
}

export function useContainerStats(): StatsByKey {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

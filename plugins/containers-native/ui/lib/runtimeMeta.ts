/**
 * Pure presentation helpers for the Containers panel: runtime labels/badge
 * colors and container-state → badge styling. No React, no side effects — unit
 * tested in runtimeMeta.test.ts.
 */
import type { ContainerRuntime } from "../types";

export function runtimeLabel(runtime: ContainerRuntime): string {
  switch (runtime) {
    case "docker":
      return "Docker";
    case "podman":
      return "Podman";
    case "apple":
      return "Apple";
  }
}

/** The CLI binary name for a runtime (used to build a `<bin> exec` command). */
export function runtimeBinary(runtime: ContainerRuntime): string {
  // Apple's runtime binary is literally `container`, not `apple`.
  return runtime === "apple" ? "container" : runtime;
}

/** Tailwind classes for the status dot + its glow, by container state. */
export function stateDotClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "running" || s === "up")
    return "bg-emerald-500 shadow-[0_0_6px_1px] shadow-emerald-500/50";
  if (s === "paused") return "bg-amber-500";
  if (s === "created") return "bg-sky-500";
  return "bg-muted-foreground/40";
}

/** Tailwind text color for the status label. */
export function statusTextClass(state: string): string {
  const s = state.toLowerCase();
  if (s === "running" || s === "up")
    return "text-emerald-600 dark:text-emerald-400";
  if (s === "paused") return "text-amber-600 dark:text-amber-400";
  return "text-muted-foreground";
}

/** Compact cpu% label, e.g. "12.5%". One decimal keeps low values legible. */
export function formatCpu(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** Memory usage — keep only the "used" side of "used / limit" if present. */
export function formatMemShort(memUsage: string): string {
  const used = memUsage.split("/")[0]?.trim();
  return used || memUsage.trim();
}

/** Clamp a percentage to 0..100 for a progress bar width. */
export function clampPct(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  return Math.min(100, Math.max(0, pct));
}

/** Tailwind classes for the per-row runtime badge. */
export function runtimeBadgeClass(runtime: ContainerRuntime): string {
  switch (runtime) {
    case "docker":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400";
    case "podman":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400";
    case "apple":
      return "bg-muted text-muted-foreground";
  }
}

/** True for states that count as "up" (running-only filter, stop/restart). */
export function isRunningState(state: string): boolean {
  const s = state.toLowerCase();
  return s === "running" || s === "up";
}

export interface StateBadge {
  label: string;
  className: string;
}

/** Badge label + color for a container state, across runtime vocabularies. */
export function stateBadge(state: string): StateBadge {
  const s = state.toLowerCase();
  if (s === "running" || s === "up") {
    return {
      label: "running",
      className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (s === "paused") {
    return {
      label: "paused",
      className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    };
  }
  if (s === "created") {
    return {
      label: "created",
      className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    };
  }
  if (s === "exited" || s === "stopped" || s === "dead") {
    return {
      label: s,
      className: "bg-muted text-muted-foreground",
    };
  }
  return { label: s || "unknown", className: "bg-muted text-muted-foreground" };
}

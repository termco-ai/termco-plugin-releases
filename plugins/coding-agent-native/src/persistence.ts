/**
 * Durable run metadata (main process). The driver holds live runs in memory and
 * forgets them once they exit; this store persists a small record per run to
 * `<userData>/coding-agents/runs.json` so the roster survives an app restart and
 * a finished run can be reopened (its transcript is re-read from the backend's
 * own session file).
 *
 * The store is pure over injected `read`/`write` fs seams, so its behavior is
 * unit-tested without touching disk. index.ts wires the real fs.
 */

import type {
  AgentBackend,
  AgentEffort,
  AgentPermissionMode,
  AgentRunStatus,
  AgentWorkspace,
} from "@termco/agents-base";

/** One persisted run — enough to rebuild a roster row and reopen its history. */
export type PersistedRun = {
  runId: string;
  backend: AgentBackend;
  title: string;
  cwd: string;
  sessionId: string | null;
  /** Encoded project slug used to reload history without recomputing. */
  projectSlug: string | null;
  permissionMode?: AgentPermissionMode;
  model?: string;
  effort?: AgentEffort;
  createdAt: number;
  updatedAt: number;
  status: AgentRunStatus;
  /** User archived this run — hidden from the active roster, shown in Archived. */
  archived?: boolean;
  /** Where the run executed (local / wsl / ssh host). Always explicit on disk. */
  workspace: Exclude<AgentWorkspace, null>;
  /** The rig this run belongs to, or null for an explicitly unscoped run. */
  rigId: string | null;
};

export type RunStoreDeps = {
  /** Read the persisted JSON text, or null if the file is absent. */
  read: () => string | null;
  /** Persist the JSON text (fire-and-forget; errors are swallowed). */
  write: (text: string) => void;
};

export type RunStore = ReturnType<typeof createRunStore>;

/** A durable, in-memory-mirrored store of run records. */
export function createRunStore(deps: RunStoreDeps) {
  let records: Record<string, PersistedRun> = {};

  /** Load records from disk into memory. Tolerates a missing/corrupt file. */
  function load(): void {
    const text = safeRead(deps);
    if (!text) return;
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) return;
      const next: Record<string, PersistedRun> = {};
      for (const r of parsed) if (isPersistedRun(r)) next[r.runId] = r;
      records = next;
    } catch {
      /* corrupt file — start clean */
    }
  }

  function persist(): void {
    try {
      deps.write(JSON.stringify(Object.values(records)));
    } catch {
      /* best-effort */
    }
  }

  /** Create or merge a record. `patch` must carry `runId`; unspecified fields on
   * an existing record are preserved. `updatedAt` is caller-supplied (no clock
   * in this module) so it stays deterministic in tests. */
  function upsert(patch: Partial<PersistedRun> & { runId: string }): void {
    const prev = records[patch.runId];
    const merged: PersistedRun = {
      runId: patch.runId,
      backend: patch.backend ?? prev?.backend ?? "claude",
      title: patch.title ?? prev?.title ?? "",
      cwd: patch.cwd ?? prev?.cwd ?? "",
      sessionId: patch.sessionId ?? prev?.sessionId ?? null,
      projectSlug: patch.projectSlug ?? prev?.projectSlug ?? null,
      permissionMode: patch.permissionMode ?? prev?.permissionMode,
      model: patch.model ?? prev?.model,
      effort: patch.effort ?? prev?.effort,
      createdAt: patch.createdAt ?? prev?.createdAt ?? 0,
      updatedAt: patch.updatedAt ?? prev?.updatedAt ?? 0,
      status: patch.status ?? prev?.status ?? "idle",
      archived: patch.archived ?? prev?.archived,
      workspace: patch.workspace ?? prev?.workspace ?? { kind: "local" },
      rigId: patch.rigId ?? prev?.rigId ?? null,
    };
    records[patch.runId] = merged;
    persist();
  }

  function remove(runId: string): void {
    if (records[runId]) {
      delete records[runId];
      persist();
    }
  }

  /** All records, newest-first. */
  function list(): PersistedRun[] {
    return Object.values(records).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** One record, or undefined. */
  function get(runId: string): PersistedRun | undefined {
    return records[runId];
  }

  return { load, upsert, remove, list, get };
}

function safeRead(deps: RunStoreDeps): string | null {
  try {
    return deps.read();
  } catch {
    return null;
  }
}

function isPersistedRun(value: unknown): value is PersistedRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.runId === "string" &&
    (run.backend === "claude" || run.backend === "codex") &&
    typeof run.title === "string" &&
    typeof run.cwd === "string" &&
    (run.sessionId === null || typeof run.sessionId === "string") &&
    (run.projectSlug === null || typeof run.projectSlug === "string") &&
    typeof run.createdAt === "number" &&
    Number.isFinite(run.createdAt) &&
    typeof run.updatedAt === "number" &&
    Number.isFinite(run.updatedAt) &&
    isRunStatus(run.status) &&
    isWorkspace(run.workspace) &&
    (run.rigId === null || typeof run.rigId === "string")
  );
}

function isRunStatus(value: unknown): value is AgentRunStatus {
  return (
    value === "starting" ||
    value === "running" ||
    value === "awaiting-approval" ||
    value === "idle" ||
    value === "done" ||
    value === "error" ||
    value === "aborted"
  );
}

function isWorkspace(value: unknown): value is Exclude<AgentWorkspace, null> {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Record<string, unknown>;
  if (workspace.kind === "local") return true;
  if (workspace.kind === "wsl") {
    return workspace.distro === undefined || typeof workspace.distro === "string";
  }
  return (
    workspace.kind === "ssh" &&
    typeof workspace.connectionId === "string" &&
    typeof workspace.host === "string" &&
    (workspace.user === undefined || typeof workspace.user === "string") &&
    (workspace.port === undefined || typeof workspace.port === "number")
  );
}
// Owned by the coding-agent-native provider plugin.

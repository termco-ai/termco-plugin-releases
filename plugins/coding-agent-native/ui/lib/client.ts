/** Source-owned by the coding-agent-native plugin.
 * Renderer client for the shared coding-session capability. Streaming events
 * arrive through `events.application`, so copied consumers never import an IPC
 * bridge or depend on Electron channel objects.
 */
import { codingAgentUiRuntime } from "../runtime";
import type {
  AgentBackend,
  AgentEffort,
  AgentEvent,
  AgentPermissionMode,
  AgentRunStartParams,
  AgentRunSummary,
  AgentSessionSearchResult,
  AgentSessionSummary,
  AgentWorkspace,
  BackendInfo,
  SlashCommand,
} from "./protocol";

/** Per-turn settings the composer can change mid-session. */
export type TurnOverrides = {
  model?: string;
  permissionMode?: AgentPermissionMode;
  effort?: AgentEffort;
};

const runListeners = new Map<string, Set<(event: AgentEvent) => void>>();

export function routeAgentEvent(payload: {
  runId: string;
  event: AgentEvent;
}): void {
  const listeners = runListeners.get(payload.runId);
  if (!listeners) return;
  for (const listener of [...listeners]) listener(payload.event);
  if (payload.event.type === "exit") runListeners.delete(payload.runId);
}

function subscribeRun(
  runId: string,
  listener: (event: AgentEvent) => void,
): () => void {
  const listeners = runListeners.get(runId) ?? new Set();
  listeners.add(listener);
  runListeners.set(runId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) runListeners.delete(runId);
  };
}

function invoke<T>(
  command: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return codingAgentUiRuntime().agents.invoke(command, payload) as Promise<T>;
}

/** Start a run; `onEvent` receives every normalized event for its lifetime. The
 * streaming channel is released automatically when the run's terminal `exit`
 * event arrives, so no preload handler leaks per run. */
export async function startRun(
  params: AgentRunStartParams,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  const unsubscribe = subscribeRun(params.runId, onEvent);
  try {
    await invoke("agent_run_start", { params });
  } catch (error) {
    unsubscribe();
    throw error;
  }
}

/** List runs the main-process driver still holds (for reload re-hydration). */
export function listRuns(): Promise<AgentRunSummary[]> {
  return invoke("agent_runs_list", {}) as Promise<AgentRunSummary[]>;
}

/** Re-attach to a live run: replays its buffered events, then keeps streaming. */
export async function resubscribeRun(
  runId: string,
  onEvent: (event: AgentEvent) => void,
): Promise<{ ok: boolean }> {
  const unsubscribe = subscribeRun(runId, onEvent);
  try {
    const result = await invoke<{ ok: boolean }>("agent_run_resubscribe", {
      runId,
    });
    if (!result.ok) unsubscribe();
    return result;
  } catch (error) {
    unsubscribe();
    throw error;
  }
}

export function sendAgentInput(
  runId: string,
  text: string,
  overrides?: TurnOverrides,
): Promise<{ ok: boolean }> {
  return invoke("agent_run_input", { runId, text, overrides }) as Promise<{
    ok: boolean;
  }>;
}

export function abortAgentRun(runId: string): Promise<{ ok: boolean }> {
  return invoke("agent_run_abort", { runId }) as Promise<{ ok: boolean }>;
}

/** Answer a pending tool-approval request for a run. `always` remembers the
 * allow so matching future calls in the run auto-approve. */
export function approveAgentTool(
  runId: string,
  approvalId: string,
  allow: boolean,
  opts?: { updatedInput?: unknown; always?: boolean },
): Promise<{ ok: boolean }> {
  return invoke("agent_run_approve", {
    runId,
    approvalId,
    allow,
    updatedInput: opts?.updatedInput,
    always: opts?.always,
  }) as Promise<{ ok: boolean }>;
}

export function endAgentRun(runId: string): Promise<{ ok: boolean }> {
  return invoke("agent_run_end", { runId }) as Promise<{ ok: boolean }>;
}

/** Drop a persisted (dead) run from on-disk history. */
export function forgetAgentRun(runId: string): Promise<{ ok: boolean }> {
  return invoke("agent_run_forget", { runId }) as Promise<{ ok: boolean }>;
}

/** Rename a run (roster/detail title). */
export function renameAgentRun(
  runId: string,
  title: string,
): Promise<{ ok: boolean }> {
  return invoke("agent_run_rename", { runId, title }) as Promise<{
    ok: boolean;
  }>;
}

/** Archive / restore a run (hidden from the active roster). */
export function archiveAgentRun(
  runId: string,
  archived: boolean,
): Promise<{ ok: boolean }> {
  return invoke("agent_run_archive", { runId, archived }) as Promise<{
    ok: boolean;
  }>;
}

/** Rename / archive a read-only history session (sidecar). */
export function setSessionMeta(
  backend: AgentBackend,
  sessionId: string,
  patch: { title?: string; archived?: boolean },
): Promise<{ ok: boolean }> {
  return invoke("agent_session_meta_set", {
    backend,
    sessionId,
    ...patch,
  }) as Promise<{ ok: boolean }>;
}

/** The run's file checkpoints (turn boundaries where the tree was snapshotted). */
export function listCheckpoints(
  runId: string,
): Promise<Array<{ turnIndex: number; at: number }>> {
  return invoke("agent_run_checkpoints", { runId }) as Promise<
    Array<{ turnIndex: number; at: number }>
  >;
}

/** Rewind the working tree to a run checkpoint (git restore, safety-snapshotted). */
export function rewindRun(
  runId: string,
  turnIndex: number,
  cwd: string,
): Promise<{ ok: boolean; error?: string }> {
  return invoke("agent_run_rewind", { runId, turnIndex, cwd }) as Promise<{
    ok: boolean;
    error?: string;
  }>;
}

/** List backends and whether each is available in the given env (ssh → probes
 * the remote host); omit `workspace` to probe locally. `refresh` busts the
 * probe cache first ("Check again" after installing the CLI). */
export function listBackends(
  workspace?: AgentWorkspace,
  opts?: { refresh?: boolean },
): Promise<BackendInfo[]> {
  return invoke("agent_backends", {
    workspace,
    refresh: opts?.refresh,
  }) as Promise<BackendInfo[]>;
}


/** Complete cross-backend history, newest
 * first. Backs the history browser. An ssh `workspace` lists the sessions on
 * that HOST (one round-trip); the promise REJECTS with a readable message when
 * the host is unreachable — surface it, don't swallow into an empty list. */
export function listAllSessions(
  workspace?: AgentWorkspace,
): Promise<AgentSessionSummary[]> {
  return invoke("agent_sessions_list_all", { workspace }) as Promise<
    AgentSessionSummary[]
  >;
}

/** Custom slash-commands available for a run's cwd (project + user scope). */
export function listSlashCommands(cwd: string): Promise<SlashCommand[]> {
  return invoke("agent_commands_list", { cwd }) as Promise<SlashCommand[]>;
}

/** Full-text search across saved transcripts (message text, not just titles).
 * `backend` narrows the scan; omit it to search all backends. Local disk only;
 * an ssh workspace yields [] (the UI hides the search box for remote rigs). */
export function searchSessions(
  query: string,
  backend?: AgentBackend,
  workspace?: AgentWorkspace,
): Promise<AgentSessionSearchResult[]> {
  return invoke("agent_sessions_search", { query, backend, workspace }) as Promise<
    AgentSessionSearchResult[]
  >;
}

/** A saved session's transcript as normalized events (fold via the reducer).
 * Routed by backend using either a rollout path or project slug.
 * A summary carrying an ssh `workspace` is read from that host; read failures
 * arrive as an error EVENT inside the array (rendered as an error block). */
export function loadSessionEvents(
  summary: AgentSessionSummary,
): Promise<AgentEvent[]> {
  return invoke("agent_session_messages", {
    backend: summary.backend,
    projectSlug: summary.projectSlug,
    sessionId: summary.sessionId,
    filePath: summary.filePath,
    workspace: summary.workspace,
  }) as Promise<AgentEvent[]>;
}

/**
 * Normalized protocol shared by the main-process coding-agent driver and the
 * renderer. Each backend CLI has its own raw JSON stream;
 * a per-backend adapter (see electron/main/coding-agent/*) translates that raw
 * stream into this single `AgentEvent` union. Everything above the adapter —
 * the transcript reducer, the store, the UI — speaks only this protocol, so the
 * app never learns which CLI produced a run.
 *
 * This module is pure types/data with no imports, so it can be imported from
 * both the Electron main process and the renderer without pulling either side's
 * dependencies across the boundary.
 */

/** Which coding-agent CLI backs a run. */
export type AgentBackend = "claude" | "codex";

/** Lifecycle status of a single agent run. */
export type AgentRunStatus =
  | "starting" // spawned, no session yet
  | "running" // actively producing a turn
  | "awaiting-approval" // blocked on a tool-permission decision
  | "idle" // finished a turn, awaiting a user follow-up
  | "done" // the run ended normally
  | "error" // the run failed
  | "aborted"; // the user stopped it

/** Token/cost accounting for a turn or a whole run. */
export type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  /** Model context window, when the backend reports it — enables a "% of
   * context" display in the run detail header. */
  contextWindow?: number;
};

/**
 * The normalized event stream. Adapters emit these; the transcript reducer
 * folds them into a renderable message list. Ordering contract per turn:
 * `session?` → (`message-start` → text/reasoning/tool events → `message-end`)*
 * → `turn-end`, with `approval-request` interleaved before the tool it gates.
 */
export type AgentEvent =
  /** Session established (or resumed): carries the backend session id. */
  | { type: "session"; sessionId: string; model?: string; cwd?: string }
  /** A new assistant message begins. */
  | { type: "message-start" }
  /** Incremental assistant text. */
  | { type: "text-delta"; text: string }
  /** A complete assistant text block (adapters without streaming use this). */
  | { type: "text"; text: string }
  /** A human user turn (used when replaying a saved session transcript). */
  | { type: "user-message"; text: string }
  /** Incremental reasoning/thinking text. */
  | { type: "reasoning-delta"; text: string }
  /** A complete reasoning block. */
  | { type: "reasoning"; text: string }
  /** The model invoked a tool (already approved or not gated). */
  | { type: "tool-start"; toolCallId: string; name: string; input?: unknown }
  /** A tool finished; `error` set → the tool failed. */
  | { type: "tool-end"; toolCallId: string; output?: unknown; error?: string }
  /** The backend is asking permission to run a tool; blocks until answered. */
  | {
      type: "approval-request";
      approvalId: string;
      toolCallId?: string;
      name: string;
      input?: unknown;
    }
  /** A pending approval was resolved without a user decision (driver-side
   * timeout, superseded by a newer request, or the run ended) — the UI card
   * must stop blocking and the gated tool is treated as denied. */
  | {
      type: "approval-cancelled";
      approvalId: string;
      reason: "timeout" | "superseded" | "run-ended";
    }
  /** The current assistant message is complete. */
  | { type: "message-end" }
  /** The turn finished; the agent is idle awaiting the next user message. */
  | { type: "turn-end"; usage?: AgentUsage; costUsd?: number }
  /** A non-fatal or fatal error surfaced by the backend. */
  | { type: "error"; message: string; fatal?: boolean }
  /** The backend process exited; `aborted` set when the user stopped it. */
  | { type: "exit"; code: number; aborted?: boolean };

/**
 * The environment a run executes in — structurally compatible with both the
 * renderer's `WorkspaceEnv` (`@/modules/workspace`) and the main-side one
 * (`workspace.registry` capability), so it can be threaded across the IPC
 * boundary without importing either. `ssh` runs the CLI on the remote host.
 */
export type AgentWorkspace =
  | { kind: "local" }
  | { kind: "wsl"; distro?: string }
  | {
      kind: "ssh";
      connectionId: string;
      host: string;
      user?: string;
      port?: number;
    }
  | null;

/** Permission posture handed to the backend for a run. */
export type AgentPermissionMode =
  | "default" // prompt on each unapproved tool
  | "acceptEdits" // auto-approve file edits
  | "plan" // read-only analysis
  | "bypass"; // auto-approve everything (guarded)

/** Reasoning/thinking effort for a turn. Adapters map it to backend-specific
 * configuration. */
export type AgentEffort = "minimal" | "low" | "medium" | "high";

/** Everything needed to start a run. Sent renderer → main over IPC. */
export type AgentRunStartParams = {
  runId: string;
  backend: AgentBackend;
  prompt: string;
  cwd: string;
  model?: string;
  permissionMode?: AgentPermissionMode;
  /** Reasoning effort for the turn (mid-session adjustable). */
  effort?: AgentEffort;
  /** Resume a prior backend session instead of starting fresh. */
  resumeSessionId?: string;
  /** The in-app chat session supervising this run, if any. */
  supervisorChatId?: string;
  /** The rig's environment — absent/local spawns locally, ssh runs remotely.
   * Resolved in the renderer (paired to the run's rig at call time) so main
   * never reads a global active env. */
  workspace?: AgentWorkspace;
  /** The rig this run belongs to — lets the MCP server scope the run's tool
   * calls to the right rig (its terminal/tabs). Set by the renderer at start. */
  rigId?: string;
  /** Main-injected (not from the renderer): the local approval-server base URL a
   * backend hook posts to for interactive tool approval. Only set for
   * LOCAL runs in an "ask" permission mode. */
  approvalEndpoint?: string;
  /** Main-injected: the MCP control-server URL the run's CLI connects to for
   * app-control tools (termco server). The token rides in `TERMCO_MCP_TOKEN`
   * (env locally, stdin for ssh) — never in argv. */
  mcpUrl?: string;
  /** Main-injected: the per-run MCP bearer token (goes to env/stdin, not argv). */
  mcpToken?: string;
};

/** Summary of a driver-held run, for rebuilding the roster after a renderer
 * reload (done/errored runs are already gone from the driver). */
export type AgentRunSummary = {
  runId: string;
  backend: AgentBackend;
  prompt: string;
  cwd: string;
  sessionId: string | null;
  running: boolean;
  /** The run's permission posture — carried so a renderer reload rebuilds the
   * roster without resetting the mode (it isn't recoverable from events). */
  permissionMode?: AgentPermissionMode;
  /** The requested model, if any. */
  model?: string;
  /** The requested reasoning effort, if any. */
  effort?: AgentEffort;
  /** Where the run executes/executed (local / wsl / ssh host). Live callers
   * may omit it to select local execution; persisted summaries are explicit. */
  workspace?: AgentWorkspace;
  /** The rig this run belongs to (roster is rig-scoped). */
  rigId?: string;
  /** True for a run the driver still holds in memory (resubscribe to replay its
   * events); false for a persisted-only run recovered after an app restart
   * (reopen loads its transcript from the backend's session file). */
  live?: boolean;
  /** Persisted-run display fields (set on `live:false` rows). */
  title?: string;
  /** Backend project slug for reopening history. */
  projectSlug?: string;
  createdAt?: number;
  status?: AgentRunStatus;
  /** User archived this run (hidden from the active roster). */
  archived?: boolean;
};

/** A past coding-agent session discovered on disk. */
export type AgentSessionSummary = {
  sessionId: string;
  /** Which CLI produced it (drives the avatar + the reopen reader). */
  backend: AgentBackend;
  /** Encoded project slug when the backend groups transcripts by workspace. */
  projectSlug: string;
  /** Absolute transcript path when required to reopen a session. */
  filePath?: string;
  /** Display name: ai-title / last-prompt / first user message. */
  name: string;
  cwd: string;
  /** Human project name for grouping (basename of cwd, fallback slug). */
  projectName?: string;
  updatedAt: number;
  messageCount: number;
  /** User archived this session (hidden unless the Archived view is shown). */
  archived?: boolean;
  /** Where the session lives. Set on remote (ssh) listings so opening/resuming
   * reads from — and continues on — the right host; absent = local disk. */
  workspace?: AgentWorkspace;
};

/** One matched message inside a session's transcript. `snippet` is a compact
 * ~150-char window around the first hit (newlines flattened to spaces, elided
 * with … at cut edges); `highlights` are [start,end) offsets INTO the snippet
 * so the UI can bold the matched runs. */
export type AgentSessionSearchMatch = {
  role: "user" | "assistant";
  snippet: string;
  highlights: Array<{ start: number; end: number }>;
};

/** A session whose transcript text matched a full-text query. */
export type AgentSessionSearchResult = {
  summary: AgentSessionSummary;
  /** Up to a few representative matches (first-hit snippets). */
  matches: AgentSessionSearchMatch[];
  /** Total hits across the whole transcript (matches[] may be capped below it). */
  totalMatches: number;
};

/** A custom slash-command discovered in a backend command directory (project or user
 * scope). Selecting it inserts `/name ` — the CLI expands it at run time. */
export type SlashCommand = {
  name: string;
  description?: string;
  scope: "project" | "user";
};

/** A backend the app can offer, with display metadata. */
export type BackendInfo = {
  backend: AgentBackend;
  label: string;
  /** The CLI binary that must be on PATH. */
  bin: string;
  /** False when the binary isn't installed / logged in. */
  available: boolean;
};

export interface CodingAgentsCapabilityCaller {
  senderWebContentsId: number;
  eventSink?: (event: AgentEvent) => void;
}

/** Application-wide events published by the selected coding-session provider.
 * Renderer consumers subscribe through `events.application`; they never open a
 * provider-specific IPC channel or import a native bridge. */
export const CODING_AGENT_EVENTS = {
  runEvent: "agents.coding-sessions.run-event",
  focusRun: "agents.coding-sessions.focus-run",
  sessionUpserted: "agents.coding-sessions.session-upserted",
} as const;

export interface CodingAgentRunEvent {
  runId: string;
  event: AgentEvent;
}

/** One application-wide supervisor for managed coding-agent CLI sessions. */
export interface CodingAgentsCapability {
  commands(): readonly string[];
  invoke(
    command: string,
    payload: Record<string, unknown>,
    caller?: CodingAgentsCapabilityCaller,
  ): Promise<unknown>;
  killAll(): void;
  liveResources(): Array<{ id: string; label: string }>;
}

export interface CodingAgentUiRunSnapshot {
  status: AgentRunStatus;
  pendingApprovalId: string | null;
  toolNames: string[];
  error: string | null;
  text: string;
}

/** Renderer-owned coding-agent workflow. Other renderer features can launch or
 * inspect runs without importing the plugin's Zustand store. */
export interface CodingAgentsUiCapability {
  start(
    input: Omit<AgentRunStartParams, "runId"> & {
      runId?: string;
      now?: number;
    },
  ): Promise<string>;
  snapshot(runId: string): CodingAgentUiRunSnapshot | null;
  respondApproval(runId: string, approvalId: string, allow: boolean): void;
  openRun(runId: string): void;
  rewindCheckpoint(input: {
    readonly runId: string;
    readonly checkpointId: string;
    readonly backend: string;
    readonly reference: unknown;
  }): Promise<{ readonly ok: boolean; readonly error?: string }>;
  /** Deterministic E2E fixture seam; unavailable unless explicitly called. */
  debugSeedRun(input: { runId: string; rigId: string; title: string }): void;
}
// Public contract owned by the platform and implemented by a provider plugin.

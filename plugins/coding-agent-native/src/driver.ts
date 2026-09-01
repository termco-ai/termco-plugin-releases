/**
 * Coding-agent driver (main process): spawns a backend CLI per turn, streams its
 * stdout through the backend adapter + line splitter into normalized
 * `AgentEvent`s, and manages the run lifecycle — follow-up turns (via session
 * resume), abort, and end.
 *
 * Backend CLIs are single-shot: each process runs one turn to
 * completion and exits. So a multi-turn run is a *sequence* of spawns sharing
 * one backend session id (captured from the first turn's `session` event and
 * reused via the adapter's resume flag). The process exiting after a `result`
 * is a normal turn boundary, not the end of the run — the run stays `idle`
 * awaiting the next user message until explicitly ended or aborted.
 *
 * `spawn` is injected so the lifecycle is unit-testable with a fake child.
 */

import type {
  AgentEffort,
  AgentEvent,
  AgentPermissionMode,
  AgentRunStartParams,
  AgentRunSummary,
} from "@termco/agents-base";
import { recordAgentEvent } from "./sessionJournal";
import { createClaudeAdapter } from "./claudeAdapter";
import { createCodexAdapter } from "./codexAdapter";
import { createLineSplitter } from "./lineSplitter";
import { makeRule, matchesRule } from "./rules";
import type { BackendAdapter } from "./types";

/** Minimal shape of a spawned child we depend on (subset of ChildProcess). */
export interface ChildLike {
  stdout: { on(event: "data", cb: (chunk: unknown) => void): void } | null;
  stderr: { on(event: "data", cb: (chunk: unknown) => void): void } | null;
  /** Present when an SSH spawn needs the one-line MCP token feed. */
  stdin?: { write(data: string): void; end?(): void } | null;
  on(event: "close", cb: (code: number | null) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  kill(signal?: string): void;
}

export type SpawnFn = (
  bin: string,
  args: string[],
  opts: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    workspace?: AgentRunStartParams["workspace"];
    /** The run's approval endpoint — lets the ssh spawn add a reverse tunnel. */
    approvalEndpoint?: string;
    /** The MCP server URL — the ssh spawn adds a reverse tunnel for it. */
    mcpUrl?: string;
    /** The per-run MCP token — for ssh it's fed to the remote over stdin (env
     * doesn't cross ssh); for local it's already in `env`. */
    mcpToken?: string;
    /** The ADAPTER's own env additions (IS_SANDBOX, MAX_THINKING_TOKENS, …),
     * unmerged with the base env — the ssh spawn inlines the non-secret ones
     * into the remote command (env doesn't cross ssh). */
    adapterEnv?: Record<string, string>;
  },
) => ChildLike;

export type EventSink = (event: AgentEvent) => void;

/** The user's answer to a tool-permission request. */
export type ApprovalOutcome = {
  allow: boolean;
  /** Optionally-modified tool input to run instead of the original. */
  updatedInput?: unknown;
  message?: string;
  /** Remember this allow so matching future tool calls in the run auto-approve
   * (allow-&-remember). Ignored when `allow` is false. */
  always?: boolean;
};

/** What an emitter asks the user to approve. */
export type ApprovalRequest = { name: string; input?: unknown; toolCallId?: string };

/** Per-turn settings the user can change mid-session (composer control row). */
export type TurnOverrides = {
  model?: string;
  permissionMode?: AgentPermissionMode;
  effort?: AgentEffort;
};

type Run = {
  params: AgentRunStartParams;
  adapter: BackendAdapter;
  send: EventSink;
  child: ChildLike | null;
  sessionId: string | null;
  /** True once a `result`/turn-end was seen this turn (clean exit expected). */
  turnCompleted: boolean;
  ending: boolean;
  aborted: boolean;
  /** Tail of the child's stderr this turn — surfaced if the turn fails. */
  stderrTail: string;
  /** Bounded replay buffer so a reloaded/second window can rebuild the run. */
  events: AgentEvent[];
  /** Allow-&-remember rules; a matching tool call auto-approves (no card). */
  rememberedRules: string[];
  /** The prompt of the CURRENT turn — needed to respawn it (root-guard retry). */
  lastPrompt: string;
  /** One-shot guard: the root-bypass retry may only fire once per run. */
  retriedRootGuard?: boolean;
};

/** Runtime refusal when full-auto runs as root, such as an SSH rig on a
 * root account, where the ssh-config alias hides the user from any static
 * check). Detected at runtime → the turn is retried once with acceptEdits. */
const ROOT_BYPASS_REFUSAL =
  /--dangerously-skip-permissions cannot be used with root\/sudo/;

/** Keep only the last ~4KB of stderr so a chatty backend can't grow unbounded. */
const STDERR_TAIL_CAP = 4000;

/** Edit-shaped tools that `acceptEdits` mode auto-approves without a card. */
const ACCEPT_EDITS_TOOLS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
]);

/** Cap the per-run replay buffer (long runs can produce thousands of events). */
const EVENT_BUFFER_CAP = 2000;

function makeAdapter(params: AgentRunStartParams): BackendAdapter {
  return params.backend === "codex" ? createCodexAdapter() : createClaudeAdapter();
}

export function createCodingAgentDriver(deps: {
  spawn: SpawnFn;
  env?: NodeJS.ProcessEnv;
  /** Live global Auto-run policy. The caller keeps catastrophic requests out
   * of this path; returning true suppresses the approval card immediately. */
  autoApprove?: (runId: string, request: ApprovalRequest) => boolean;
  /** Auto-deny a pending approval after this long (emits `approval-cancelled`),
   * so a card can never strand the transcript. 0 disables (tests). Default 9m. */
  approvalTimeoutMs?: number;
}) {
  const runs = new Map<string, Run>();
  const baseEnv = deps.env ?? process.env;
  const approvalTimeoutMs = deps.approvalTimeoutMs ?? 9 * 60 * 1000;

  // Approvals awaiting a user decision, keyed by approvalId. The emitter (the
  // approval hook or MCP permit call awaits the promise; the
  // renderer resolves it via `agent_run_approve` → `resolveApproval`. `name`/
  // `input` are retained so an allow-&-remember decision can build a rule.
  const pendingApprovals = new Map<
    string,
    {
      runId: string;
      resolve: (o: ApprovalOutcome) => void;
      name?: string;
      input?: unknown;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();
  let approvalSeq = 0;

  /** Buffer an event for replay, then hand it to the run's current sink.
   * Every event also lands in the canonical session as an adapter-fidelity entry —
   * this is the choke point all 14 AgentEvent types pass through, and unlike
   * the sink it survives a resubscribe (replays never re-enter emit, so the
   * session journal sees each event exactly once). */
  function emit(run: Run, ev: AgentEvent): void {
    run.events.push(ev);
    if (run.events.length > EVENT_BUFFER_CAP) run.events.shift();
    recordAgentEvent(run.params.runId, `agent-${ev.type}`, ev);
    run.send(ev);
  }

  /** Deny + clear any approvals still pending for a run (so the emitter that's
   * awaiting a decision unblocks when the run ends). Emits `approval-cancelled`
   * so the UI card resolves visually. */
  function denyPendingFor(runId: string): void {
    const run = runs.get(runId);
    for (const [id, p] of pendingApprovals) {
      if (p.runId !== runId) continue;
      if (p.timer) clearTimeout(p.timer);
      pendingApprovals.delete(id);
      if (run) emit(run, { type: "approval-cancelled", approvalId: id, reason: "run-ended" });
      p.resolve({ allow: false, message: "run ended" });
    }
  }

  /** Delete a run and release anything waiting on it. */
  function dropRun(runId: string): void {
    denyPendingFor(runId);
    runs.delete(runId);
  }

  /** Spawn one turn: build argv (with resume if we have a session), wire stdout. */
  function spawnTurn(run: Run, prompt: string): void {
    run.lastPrompt = prompt;
    const adapter = run.adapter;
    const params: AgentRunStartParams = {
      ...run.params,
      prompt,
      resumeSessionId: run.sessionId ?? run.params.resumeSessionId,
    };
    const { bin, args, env } = adapter.buildCommand(params);
    run.turnCompleted = false;
    run.stderrTail = "";
    const child = deps.spawn(bin, args, {
      cwd: run.params.cwd,
      env: { ...baseEnv, ...env },
      workspace: run.params.workspace,
      approvalEndpoint: run.params.approvalEndpoint,
      mcpUrl: run.params.mcpUrl,
      mcpToken: run.params.mcpToken,
      adapterEnv: env,
    });
    run.child = child;

    const splitter = createLineSplitter();
    const consume = (lines: string[]) => {
      for (const line of lines) {
        for (const ev of adapter.parseLine(line)) {
          if (ev.type === "session") run.sessionId = ev.sessionId;
          if (ev.type === "turn-end") run.turnCompleted = true;
          emit(run, ev);
        }
      }
    };

    child.stdout?.on("data", (chunk) => consume(splitter.push(String(chunk))));
    // Drain stderr (auth errors, "not logged in", usage text) into a bounded
    // tail; an undrained pipe could also backpressure-block a chatty backend.
    child.stderr?.on("data", (chunk) => {
      run.stderrTail = (run.stderrTail + String(chunk)).slice(-STDERR_TAIL_CAP);
    });

    child.on("error", (err) => {
      emit(run, { type: "error", message: err.message, fatal: true });
      emit(run, { type: "exit", code: -1 });
      dropRun(run.params.runId);
    });

    child.on("close", (code) => {
      consume(splitter.flush());
      run.child = null;
      if (run.aborted) {
        emit(run, { type: "exit", code: code ?? 0, aborted: true });
        dropRun(run.params.runId);
        return;
      }
      if (!run.turnCompleted) {
        const detail = run.stderrTail.trim();
        // A backend may refuse full-auto as root; a static check
        // can't catch this for ssh-config aliases (the user is invisible), so
        // detect the refusal at runtime and retry the SAME turn once with
        // acceptEdits. The MCP token was minted with the full-auto intent, so
        // app-control tools stay hands-free.
        if (
          ROOT_BYPASS_REFUSAL.test(detail) &&
          run.params.permissionMode === "bypass" &&
          !run.retriedRootGuard
        ) {
          run.retriedRootGuard = true;
          run.params.permissionMode = "acceptEdits";
          emit(run, {
            type: "error",
            message:
              "Full-auto isn't allowed for Claude Code running as root (its " +
              "own safety guard) — retrying with Accept-Edits. App-control " +
              "(MCP) tools still run without prompts.",
            fatal: false,
          });
          spawnTurn(run, run.lastPrompt);
          return;
        }
        // Exited without a result — a crash OR a clean-but-empty exit (auth
        // failure printed to stderr, no output, …). Surface stderr so the user
        // sees WHY, and always emit a terminal exit so the run can't hang.
        emit(run, {
          type: "error",
          message: detail || `agent exited (code ${code ?? "?"}) without producing a result`,
          fatal: true,
        });
        emit(run, { type: "exit", code: code ?? -1 });
        dropRun(run.params.runId);
        return;
      }
      if (run.ending) {
        emit(run, { type: "exit", code: code ?? 0 });
        dropRun(run.params.runId);
      }
      // Otherwise: normal turn boundary — the run stays idle for a follow-up.
    });
  }

  return {
    /** Start a run and stream its first turn. */
    startRun(params: AgentRunStartParams, send: EventSink): void {
      if (runs.has(params.runId)) return;
      const run: Run = {
        // Own a copy — `sendInput` overrides mutate `run.params` in place, and we
        // must never mutate the caller's object.
        params: { ...params },
        adapter: makeAdapter(params),
        send,
        child: null,
        sessionId: params.resumeSessionId ?? null,
        turnCompleted: false,
        ending: false,
        aborted: false,
        stderrTail: "",
        events: [],
        rememberedRules: [],
        lastPrompt: params.prompt,
      };
      runs.set(params.runId, run);
      spawnTurn(run, params.prompt);
    },

    /** Send a follow-up user message — spawns a new turn resuming the session.
     * Optional per-turn overrides (model / permission mode / effort) update the
     * run's params so this and every later turn use them (argv is rebuilt each
     * turn from `run.params`). */
    sendInput(runId: string, text: string, overrides?: TurnOverrides): boolean {
      const run = runs.get(runId);
      if (!run || run.child) return false; // busy or unknown
      if (overrides) {
        if (overrides.model !== undefined) run.params.model = overrides.model;
        if (overrides.permissionMode !== undefined) {
          run.params.permissionMode = overrides.permissionMode;
        }
        if (overrides.effort !== undefined) run.params.effort = overrides.effort;
      }
      spawnTurn(run, text);
      return true;
    },

    /** Hard-stop the current turn; the run is removed once the child closes. */
    abortRun(runId: string): boolean {
      const run = runs.get(runId);
      if (!run) return false;
      run.aborted = true;
      if (run.child) run.child.kill("SIGTERM");
      else {
        emit(run, { type: "exit", code: 0, aborted: true });
        dropRun(runId);
      }
      return true;
    },

    /** End an idle run cleanly (no child running). */
    endRun(runId: string): boolean {
      const run = runs.get(runId);
      if (!run) return false;
      run.ending = true;
      if (run.child) run.child.kill("SIGTERM");
      else {
        emit(run, { type: "exit", code: 0 });
        dropRun(runId);
      }
      return true;
    },

    /** SIGTERM every live child — called on app quit so no CLI is orphaned. */
    killAll(): void {
      for (const run of runs.values()) run.child?.kill("SIGTERM");
      for (const [, p] of pendingApprovals) p.resolve({ allow: false });
      pendingApprovals.clear();
      runs.clear();
    },

    /** Summaries of every run the driver still holds — used to rebuild the
     * roster after a renderer reload (done/errored runs are already gone). */
    listRuns(): AgentRunSummary[] {
      return [...runs.values()].map((r) => ({
        runId: r.params.runId,
        backend: r.params.backend,
        prompt: r.params.prompt,
        cwd: r.params.cwd,
        sessionId: r.sessionId,
        running: r.child !== null,
        permissionMode: r.params.permissionMode,
        model: r.params.model,
        effort: r.params.effort,
        workspace: r.params.workspace,
        rigId: r.params.rigId,
      }));
    },

    /** Ask the user to approve a tool call: emits `approval-request` (lighting
     * up the renderer's `AiToolApproval` card) and resolves once the renderer
     * calls `resolveApproval`. Returns deny if the run is gone. Called by the
     * managed-agent MCP permit tool. */
    requestApproval(runId: string, req: ApprovalRequest): Promise<ApprovalOutcome> {
      const run = runs.get(runId);
      if (!run) return Promise.resolve({ allow: false, message: "no such run" });
      if (deps.autoApprove?.(runId, req) === true) {
        recordAgentEvent(runId, "approval-decision", {
          name: req.name,
          allow: true,
          auto: "global-auto-run",
        });
        return Promise.resolve({ allow: true });
      }
      // Allow-&-remember: a matching rule auto-approves with no card.
      if (matchesRule(run.rememberedRules, req.name, req.input)) {
        recordAgentEvent(runId, "approval-decision", {
          name: req.name,
          allow: true,
          auto: "rule",
        });
        return Promise.resolve({ allow: true });
      }
      // acceptEdits auto-approves edit tools; the
      // hook intercepts them anyway (one matcher for every hooked mode), so
      // mirror that auto-approval here instead of surfacing a card.
      if (
        run.params.permissionMode === "acceptEdits" &&
        ACCEPT_EDITS_TOOLS.has(req.name)
      ) {
        recordAgentEvent(runId, "approval-decision", {
          name: req.name,
          allow: true,
          auto: "acceptEdits",
        });
        return Promise.resolve({ allow: true });
      }
      approvalSeq += 1;
      const approvalId = `${runId}:ap${approvalSeq}`;
      emit(run, {
        type: "approval-request",
        approvalId,
        toolCallId: req.toolCallId,
        name: req.name,
        input: req.input,
      });
      return new Promise((resolve) => {
        const timer =
          approvalTimeoutMs > 0
            ? setTimeout(() => {
                if (!pendingApprovals.delete(approvalId)) return;
                emit(run, {
                  type: "approval-cancelled",
                  approvalId,
                  reason: "timeout",
                });
                resolve({ allow: false, message: "approval timed out" });
              }, approvalTimeoutMs)
            : undefined;
        pendingApprovals.set(approvalId, {
          runId,
          resolve,
          name: req.name,
          input: req.input,
          timer,
        });
      });
    },

    /** Resolve a pending approval with the user's decision. On allow-&-remember,
     * record a rule so matching future calls in the run auto-approve. */
    resolveApproval(approvalId: string, outcome: ApprovalOutcome): boolean {
      const p = pendingApprovals.get(approvalId);
      if (!p) return false;
      if (p.timer) clearTimeout(p.timer);
      pendingApprovals.delete(approvalId);
      // The user's decision (incl. an always-rule) is part of the run's story.
      recordAgentEvent(p.runId, "approval-decision", {
        approvalId,
        name: p.name,
        allow: outcome.allow,
        always: Boolean(outcome.always),
        ...(outcome.updatedInput !== undefined
          ? { updatedInput: outcome.updatedInput }
          : {}),
      });
      if (outcome.allow && outcome.always && p.name !== undefined) {
        const run = runs.get(p.runId);
        if (run) {
          const rule = makeRule(p.name, p.input);
          if (!run.rememberedRules.includes(rule)) run.rememberedRules.push(rule);
        }
      }
      p.resolve(outcome);
      return true;
    },

    /** Point a run at a new sink and replay its buffered events, so a reloaded
     * or second window rebuilds the full transcript and keeps streaming. */
    resubscribe(runId: string, send: EventSink): boolean {
      const run = runs.get(runId);
      if (!run) return false;
      run.send = send;
      for (const ev of run.events) send(ev);
      return true;
    },

    /** The run's CURRENT permission mode (reflects mid-session changes) — the
     * MCP approval pipeline reads it so switching autonomy re-gates app tools. */
    permissionModeOf(runId: string): AgentPermissionMode | undefined {
      return runs.get(runId)?.params.permissionMode;
    },

    /** Test/introspection helper. */
    activeRunIds(): string[] {
      return [...runs.keys()];
    },
  };
}

export type CodingAgentDriver = ReturnType<typeof createCodingAgentDriver>;
// Owned by the coding-agent-native provider plugin.

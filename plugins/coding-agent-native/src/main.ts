/**
 * Coding-agent plugin: exposes the driver to the renderer over the IPC bridge.
 * `agent_run_start` opens a streaming channel (the run's event sink); follow-up
 * / abort / end reference the run by id and reuse that sink.
 *
 * The driver is a module singleton bound to the real `child_process.spawn`, so
 * one instance supervises every run across windows. Registration-time side
 * effects (store loads, MCP handler hookup, session watcher) live in `apply`;
 * teardown (watcher close, child kill, approval server close) is effect-scoped
 * so disposing the plugin reverts them.
 */

import { execFile, spawn as nodeSpawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { app, BrowserWindow, Notification } from "electron";
import type {
  AgentBackend,
  AgentEvent,
  AgentRunStartParams,
  AgentRunSummary,
  AgentWorkspace,
  BackendInfo,
  CodingAgentsCapability,
  CodingAgentsCapabilityCaller,
} from "@termco/agents-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import type { McpServerCapability } from "@termco/mcp-base";
import type { SessionHistoryCapability } from "@termco/session-base";
import type { WorkspaceExecutionCapability } from "@termco/workspace-base";
import {
  SETTINGS_PREFERENCES_SERVICE,
  type PreferencesCapability,
} from "@termco/storage-base";

const CODING_AGENT_EVENTS = {
  runEvent: "agents.coding-sessions.run-event",
  focusRun: "agents.coding-sessions.focus-run",
  sessionUpserted: "agents.coding-sessions.session-upserted",
} as const;

const CATASTROPHIC_COMMAND = [
  /\brm\s+(?:-\S*\s+)*-\S*[rf]\S*[rf]/i,
  /\b(mkfs|shutdown|reboot|halt|poweroff|sudo)\b/i,
  /\bdd\b[^|&;]*\bof=\/dev\//i,
  /\bgit\s+(?:push\b[^\n]*(?:--force|\s-f\b)|reset\s+--hard|clean\s+-\S*f)/i,
  /\b(curl|wget)\b[^|]*\|\s*(?:sudo\s+)?\w*sh\b/i,
  /\b(?:npm|yarn|pnpm)\s+publish\b|\bdocker\s+system\s+prune\b/i,
] as const;

function isCatastrophicShellCommand(command: string): boolean {
  return CATASTROPHIC_COMMAND.some((pattern) => pattern.test(command.trim()));
}
import {
  configureAgentSessionJournal,
  ensureAgentSession,
  recordAgentCheckpoint,
  recordAgentEvent,
} from "./sessionJournal";
import {
  type ApprovalServer,
  startApprovalServer,
} from "./approvalServer";
import {
  type ChildLike,
  createCodingAgentDriver,
  type SpawnFn,
} from "./driver";
import {
  maybeNotify,
  type NotifyDeps,
} from "./notifications";
import { createRunStore } from "./persistence";
import {
  mcpReverseTunnelOpts,
  REMOTE_PROBE_MARKER,
  remoteProbeCommand,
  reverseTunnelOpts,
  sshSpawnArgs,
  targetFromWorkspace,
} from "./remote";
import {
  listCodexSessions,
  readCodexSessionEvents,
} from "./codexSessions";
import {
  listRemoteSessions,
  readRemoteSessionEvents,
} from "./remoteSessions";
import {
  listAllSessions,
  listSessions,
  readSessionEvents,
  slugFromCwd,
} from "./sessions";
import { searchSessions } from "./search";
import { listSlashCommands } from "./commands";
import {
  createSessionMetaStore,
  sessionMetaKey,
} from "./sessionMeta";
import { startSessionWatcher } from "./sessionWatcher";
import {
  clearLocalExecutableCache,
  localExecutableEnvironment,
  resolveLocalExecutable,
} from "./localExecutable";
import {
  type Checkpoint,
  createCheckpoints,
} from "./checkpoints";
import { initSummaryDiskCache } from "./summaryDiskCache";
import { codingAgentRuntime, configureCodingAgentRuntime } from "./runtime";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { MCP_SERVER_SERVICE } from "@termco/mcp-base";
import { SESSION_HISTORY_SERVICE } from "@termco/session-base";
import { WORKSPACE_EXECUTION_SERVICE } from "@termco/workspace-base";

type ChannelMarker = { __termcoChannel: number };
type LocalCommandContext = {
  channel(marker: ChannelMarker): (event: AgentEvent) => void;
};
type CommandHandler = (
  payload: Record<string, unknown>,
  context: LocalCommandContext,
) => unknown;

const handlers = new Map<string, CommandHandler>();

function command(name: string, handler: CommandHandler): () => void {
  if (handlers.has(name)) throw new Error(`duplicate coding-agent command: ${name}`);
  handlers.set(name, handler);
  return () => {
    if (handlers.get(name) === handler) handlers.delete(name);
  };
}

/** A file under `<userData>/coding-agents/`. */
function dataFile(name: string): string {
  const dir = join(app.getPath("userData"), "coding-agents");
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

/** Durable run metadata so the roster survives an app restart. */
const runStore = createRunStore({
  read: () => {
    try {
      return readFileSync(dataFile("runs.json"), "utf8");
    } catch {
      return null;
    }
  },
  write: (text) => writeFileSync(dataFile("runs.json"), text),
});

/** Custom title / archived flag for read-only history sessions. */
const sessionMetaStore = createSessionMetaStore({
  read: () => {
    try {
      return readFileSync(dataFile("session-meta.json"), "utf8");
    } catch {
      return null;
    }
  },
  write: (text) => writeFileSync(dataFile("session-meta.json"), text),
});

/** Git working-tree checkpoints for file rewind. Snapshots are ephemeral git
 * objects (stash-create commits) held in memory for the session — rewind works
 * while the app is open, before git GCs the unreferenced objects. */
const checkpoints = createCheckpoints(async (args, cwd) => {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
    });
    return { stdout, stderr: "", code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(e),
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
});

/** Per-run checkpoint log: turn 0 = pre-run state, then one per turn-end. */
type CheckpointEntry = { turnIndex: number; cp: Checkpoint; at: number };
const runCheckpoints = new Map<string, CheckpointEntry[]>();

/** Per-run promise chain so async snapshots land in turn order (turn 0 before
 * turn 1) even though each git call is non-blocking. */
const checkpointChains = new Map<string, Promise<void>>();

/** Snapshot the run's working tree at a turn boundary (best-effort, no-op off
 * a git repo). Async fire-and-forget — the event stream must not wait on git. */
function snapshotRun(runId: string, cwd: string, turnIndex: number): void {
  // Eagerly mark the run so the turn-0 guard can't double-fire while the first
  // snapshot is still in flight.
  if (!runCheckpoints.has(runId)) runCheckpoints.set(runId, []);
  const prev = checkpointChains.get(runId) ?? Promise.resolve();
  const next = prev
    .then(async () => {
      const cp = await checkpoints.snapshot(cwd);
      if (!cp) return;
      const at = Date.now();
      const log = runCheckpoints.get(runId) ?? [];
      log.push({ turnIndex, cp, at });
      runCheckpoints.set(runId, log);
      recordAgentCheckpoint(runId, {
        checkpointId: `${runId}:${turnIndex}`,
        backend: "git",
        reference: { turnIndex, at },
        summary: `Workspace state after turn ${turnIndex}`,
      });
    })
    .catch(() => {
      /* best effort */
    });
  checkpointChains.set(runId, next);
}

/** First line of a prompt, for a persisted run's title. */
function firstLine(prompt: string): string {
  return (prompt.trim().split("\n")[0] ?? "").slice(0, 120);
}

/** OS-notification wiring: real Electron Notification + window focus. */
const notifyDeps: NotifyDeps = {
  isFocused: () => BrowserWindow.getFocusedWindow() !== null,
  notify: ({ title, body, onClick }) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on("click", onClick);
    n.show();
  },
  focusRun: (runId) => {
    const win =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    // Ask the renderer to open the run (app-global event bus).
    codingAgentRuntime().events.emit(CODING_AGENT_EVENTS.focusRun, { runId });
  },
};

// Node's ChildProcess has overloaded `.on` signatures that don't structurally
// unify with our minimal ChildLike; the runtime shape matches exactly.
const spawn: SpawnFn = (bin, args, opts) => {
  // SSH rig → run the CLI on the remote host and stream its stdout back over
  // the ssh channel; local/wsl/none → spawn locally as before.
  if (opts.workspace?.kind === "ssh") {
    // Feed the MCP token over stdin (env doesn't cross ssh; an inline VAR= would
    // leak in remote `ps`). That forces a stdin pipe for every backend.
    const withToken = Boolean(opts.mcpToken);
    const stdinMode = withToken ? "pipe" : "ignore";
    // `-R` reverse tunnels: one for the approval hook, one for the MCP server
    // (both same-port so their URLs resolve on the remote unchanged).
    const tunnel = [
      ...reverseTunnelOpts(opts.approvalEndpoint),
      ...mcpReverseTunnelOpts(opts.mcpUrl),
    ];
    // Inline the adapter's non-secret env (IS_SANDBOX for full-auto-as-root,
    // MAX_THINKING_TOKENS, …) into the remote command — env doesn't cross ssh.
    // The TOKEN is deliberately excluded: it rides on stdin (never in `ps`).
    const { TERMCO_MCP_TOKEN: _t, ...remoteEnv } = opts.adapterEnv ?? {};
    const child = nodeSpawn(
      "ssh",
      sshSpawnArgs(opts.workspace, bin, args, opts.cwd, tunnel, withToken, remoteEnv),
      { env: process.env, stdio: [stdinMode, "pipe", "pipe"] },
    ) as unknown as ChildLike;
    // The remote `read` consumes this first line BEFORE exec, so the CLI never
    // sees it. Close stdin immediately afterwards; keeping the pipe open makes
    // CLIs wait for input they do not consume in non-interactive mode.
    if (withToken) {
      child.stdin?.write(`${opts.mcpToken}\n`);
      child.stdin?.end?.();
    }
    return child;
  }
  return nodeSpawn(resolvedLocalBins.get(bin) ?? bin, args, {
    cwd: opts.cwd,
    env: localExecutableEnvironment(opts.env),
    stdio: ["ignore", "pipe", "pipe"],
  }) as unknown as ChildLike;
};

let globalAgentAutoRun = false;
const driver = createCodingAgentDriver({
  spawn,
  autoApprove: (_runId, request) => {
    if (!globalAgentAutoRun) return false;
    const input = request.input && typeof request.input === "object"
      ? request.input as Record<string, unknown>
      : {};
    const command = typeof input.command === "string" ? input.command : "";
    return !command || !isCatastrophicShellCommand(command);
  },
});

// Loopback server backing interactive tool approval for local agent runs.
// Started lazily on the first applicable run and closed by
// `killAllCodingAgents` / the plugin disposer.
let approvalServer: ApprovalServer | null = null;
function ensureApprovalServer(): ApprovalServer {
  if (!approvalServer) {
    approvalServer = startApprovalServer((runId, req) => driver.requestApproval(runId, req));
  }
  return approvalServer;
}

/** Whether to PROVISION the interactive-approval endpoint for a run. Provision
 * it for every applicable run, so switching autonomy
 * to a prompting mode mid-session works — the adapter decides per-turn whether
 * to actually install the hook, based on the current mode (see buildSettings).
 * The endpoint is a loopback server (singleton) + an ssh `-R` tunnel; unused in
 * bypass, cheap to keep ready. */
function provisionApprovalEndpoint(params: AgentRunStartParams): boolean {
  return params.backend === "claude";
}

/** Availability cache keyed by `<epoch>:local:<bin>` / `<epoch>:<connectionId>:<bin>`.
 * `PROBE_EPOCH` is bumped whenever the probe COMMAND changes semantics (e.g. the
 * PATH-prelude fix), so results cached by an older, blinder probe are ignored
 * instead of pinning a host on "not installed" forever. */
const PROBE_EPOCH = "v3";
const availabilityCache = new Map<string, boolean>();
const resolvedLocalBins = new Map<string, string>();

const execFileAsync = promisify(execFile);

/** Local: a CLI is available if `--version` PRODUCED OUTPUT (some print a version
 * but exit non-zero, or lack `--version`); only a spawn error (ENOENT) = missing.
 *
 * ASYNC on purpose: coding-agent CLIs are heavy Node processes and cold starts
 * SYNCHRONOUSLY (the old `spawnSync`) froze the main-process main thread for
 * hundreds of ms to seconds each — a macOS beachball on agent-panel open / rig
 * switch. `execFile` keeps the probe off the main thread; the result is cached
 * so it runs at most once per binary. */
async function isAvailableLocal(bin: string): Promise<boolean> {
  const key = `${PROBE_EPOCH}:local:${bin}`;
  const cached = availabilityCache.get(key);
  if (cached !== undefined) return cached;
  const resolved = await resolveLocalExecutable(bin);
  if (!resolved) {
    availabilityCache.set(key, false);
    resolvedLocalBins.delete(bin);
    return false;
  }
  resolvedLocalBins.set(bin, resolved);
  let ok = true;
  try {
    await execFileAsync(resolved, ["--version"], {
      timeout: 4000,
      encoding: "utf8",
      env: localExecutableEnvironment(process.env),
    });
  } catch (e) {
    // Discovery answers "is an executable installed?", not "is its account
    // authenticated?". Non-zero exits and timeouts are runtime concerns; only
    // an executable that cannot be spawned is unavailable.
    const code = (e as NodeJS.ErrnoException).code;
    ok = code !== "ENOENT" && code !== "EACCES";
    if (!ok) resolvedLocalBins.delete(bin);
  }
  availabilityCache.set(key, ok);
  return ok;
}

/** Remote: `command -v <bin>` over ssh (non-blocking via runSsh). */
async function isAvailableRemote(
  ws: Extract<AgentWorkspace, { kind: "ssh" }>,
  bin: string,
): Promise<boolean> {
  const key = `${PROBE_EPOCH}:${ws.connectionId}:${bin}`;
  const cached = availabilityCache.get(key);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const target = targetFromWorkspace(ws);
    const out = await codingAgentRuntime().execution.invoke<{ stdout: string }>(ws, {
      domain: "ssh",
      method: "runSsh",
      args: [target, remoteProbeCommand(bin), 10],
    });
    ok = (out.stdout ?? "").includes(REMOTE_PROBE_MARKER);
  } catch {
    ok = false;
  }
  availabilityCache.set(key, ok);
  return ok;
}

const BACKENDS: Array<{ backend: AgentBackend; label: string; bin: string }> = [
  { backend: "claude", label: "Claude Code", bin: "claude" },
  { backend: "codex", label: "Codex", bin: "codex" },
];

let sessionWatcher: { close: () => void } | null = null;

/** Terminate every live coding-agent child during app shutdown. */
export function killAllCodingAgents(): void {
  driver.killAll();
  approvalServer?.close();
  approvalServer = null;
  sessionWatcher?.close();
  sessionWatcher = null;
}

let activeCapability: CodingAgentsCapability | null = null;

export function codingAgentLifecycleResources(): {
  activeCapability: boolean;
  commands: number;
  sessionWatcher: boolean;
  approvalServer: boolean;
  runs: number;
} {
  return {
    activeCapability: activeCapability !== null,
    commands: handlers.size,
    sessionWatcher: sessionWatcher !== null,
    approvalServer: approvalServer !== null,
    runs: driver.listRuns().length,
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    MCP_SERVER_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
    SESSION_HISTORY_SERVICE,
  ],
  async activate(ctx) {
    const preferences = ctx.get<PreferencesCapability>(
      SETTINGS_PREFERENCES_SERVICE,
    );
    globalAgentAutoRun = await preferences.get<boolean>("agentAutoApprove") === true;
    await ctx.effect(() => preferences.subscribe((key, value) => {
      if (key === "agentAutoApprove") globalAgentAutoRun = value === true;
    }));
    await ctx.effect(() => () => {
      globalAgentAutoRun = false;
    });
    const runtime = {
      events: ctx.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
      mcpServer: ctx.get<McpServerCapability>("mcp.server"),
      execution: ctx.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE),
      history: ctx.get<SessionHistoryCapability>(SESSION_HISTORY_SERVICE),
    };
    await ctx.effect(() => {
      configureCodingAgentRuntime(runtime);
      configureAgentSessionJournal(runtime.history);
      return () => {
        configureAgentSessionJournal(null);
        configureCodingAgentRuntime(null);
      };
    });
    const mcpServer = runtime.mcpServer;
    // Idempotent disk loads: re-applying the plugin re-reads the same files,
    // so these are plain calls (no meaningful reverse operation).
    runStore.load();
    // History-scan summaries persist across restarts, so a cold "load history"
    // only parses transcripts whose mtime changed (no startup CPU spike).
    initSummaryDiskCache(dataFile("session-index-cache.json"));
    sessionMetaStore.load();

    // A managed run's MCP tool approvals go through the SAME driver flow as its
    // other tool approvals, so the card renders in the run view (not the app-wide
    // overlay). The driver owns allow-&-remember + the 9-minute timeout.
    await ctx.effect(() => {
      mcpServer.setRunApprovalHandler(async (runId, req) => {
        const outcome = await driver.requestApproval(runId, {
          name: `mcp__termco__${req.name}`,
          input: req.input,
        });
        return { allow: outcome.allow, always: outcome.always };
      });
      return () => mcpServer.setRunApprovalHandler(null);
    });

    // App-control tools auto-approve iff the run is CURRENTLY in full-auto — so
    // switching a run's autonomy mid-session re-gates them (fixes "changing
    // ask/auto-edit after starting full-auto did nothing").
    await ctx.effect(() => {
      mcpServer.setRunFullAutoResolver(
        (runId) => driver.permissionModeOf(runId) === "bypass",
      );
      return () => mcpServer.setRunFullAutoResolver(null);
    });

    // Live transcript refresh: when a CLI (or our own run) writes a session file,
    // tell renderers to re-read the open history view / list.
    await ctx.effect(() => {
      const watcher = startSessionWatcher(() => {
        runtime.events.emit(CODING_AGENT_EVENTS.sessionUpserted, null);
      });
      sessionWatcher = watcher;
      return () => {
        watcher.close();
        if (sessionWatcher === watcher) sessionWatcher = null;
      };
    });

    // On disposal (app quit / plugin unload): no coding-agent child survives,
    // and the lazily-started approval server is closed.
    await ctx.effect(() => () => {
      driver.killAll();
      approvalServer?.close();
      approvalServer = null;
    });

    await ctx.effect(() =>
      command("agent_run_start", (p, cctx) => {
        const params = p.params as AgentRunStartParams;
        const send = cctx.channel(p.onEvent as ChannelMarker) as (e: AgentEvent) => void;
        // Full-auto remains enabled on a root SSH host when the adapter provides
        // the backend's supported root-guard override.
        // The driver keeps a runtime retry (acceptEdits) as a last-ditch net if a
        // host still refuses. Other backends use their own bypass flag.
        const wantedFullAuto = params.permissionMode === "bypass";
        let withApproval = provisionApprovalEndpoint(params)
          ? { ...params, approvalEndpoint: ensureApprovalServer().baseUrl() }
          : params;
        // Give the run access to the app's MCP control tools: mint a per-run token
        // (scoped to the run's rig) and inject the server URL. The token rides in
        // env/stdin, never argv. Full-auto (bypass) auto-approves non-catastrophic
        // MCP calls. Requires the server up and the run to know its rig.
        const mcpUrl = mcpServer.url();
        if (mcpUrl && params.rigId) {
          const token = mcpServer.mintRunToken(params.runId, params.rigId, wantedFullAuto);
          withApproval = { ...withApproval, mcpUrl, mcpToken: token };
        }
        // Persist the run's metadata so it survives an app restart, and update its
        // status/session at the meaningful transitions. A revive (same runId after
        // a restart, resuming its session) keeps the original title/creation time.
        const now = Date.now();
        const existing = runStore.get(params.runId);
        runStore.upsert({
          runId: params.runId,
          backend: params.backend,
          title: existing?.title ?? firstLine(params.prompt),
          cwd: params.cwd,
          sessionId: params.resumeSessionId ?? null,
          projectSlug:
            params.backend === "claude" ? slugFromCwd(params.cwd) : null,
          permissionMode: params.permissionMode,
          model: params.model,
          effort: params.effort,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          status: "starting",
          workspace: params.workspace ?? existing?.workspace,
          rigId: params.rigId ?? existing?.rigId,
        });
        ensureAgentSession(params.runId, () => ({
          backend: params.backend,
          model: params.model,
          rigId: params.rigId,
          startedAt: now,
          title: existing?.title ?? firstLine(params.prompt),
        }));
        recordAgentEvent(params.runId, "user-prompt", { text: params.prompt });
        let turnCounter = 0;
        const observedSend = (e: AgentEvent) => {
          const t = Date.now();
          if (e.type === "session") {
            runStore.upsert({
              runId: params.runId,
              sessionId: e.sessionId,
              model: e.model ?? params.model,
              updatedAt: t,
              status: "running",
            });
            recordAgentEvent(params.runId, "status", { status: "running" });
            // Turn 0: the pre-change baseline (so a rewind can undo all edits).
            if (!runCheckpoints.has(params.runId)) {
              snapshotRun(params.runId, params.cwd, 0);
            }
          } else if (e.type === "turn-end") {
            runStore.upsert({ runId: params.runId, updatedAt: t, status: "idle" });
            recordAgentEvent(params.runId, "status", { status: "idle" });
            turnCounter += 1;
            snapshotRun(params.runId, params.cwd, turnCounter);
          } else if (e.type === "exit") {
            const status = e.aborted ? "aborted" : "done";
            runStore.upsert({ runId: params.runId, updatedAt: t, status });
            recordAgentEvent(params.runId, "status", { status });
            // The run is over — its MCP token (and remembered rules) die with it.
            mcpServer.releaseRunToken(params.runId);
          } else if (e.type === "error" && e.fatal) {
            runStore.upsert({ runId: params.runId, updatedAt: t, status: "error" });
            recordAgentEvent(params.runId, "status", { status: "error" });
          }
          // Surface background activity (approval/finish/error) as an OS notification
          // when the window isn't focused.
          maybeNotify(notifyDeps, {
            event: e,
            runId: params.runId,
            runTitle: firstLine(params.prompt),
          });
          runtime.events.emit(CODING_AGENT_EVENTS.runEvent, {
            runId: params.runId,
            event: e,
          });
          send(e);
        };
        driver.startRun(withApproval, observedSend);
        return { started: true, runId: params.runId };
      }),
    );

    await ctx.effect(() =>
      command("agent_run_input", (p) => {
        const overrides = (p.overrides ?? undefined) as
          | { model?: string; permissionMode?: string; effort?: string }
          | undefined;
        const ok = driver.sendInput(
          String(p.runId),
          String(p.text ?? ""),
          overrides as Parameters<typeof driver.sendInput>[2],
        );
        // Each follow-up prompt is part of the canonical session journal.
        if (ok) {
          recordAgentEvent(String(p.runId), "user-prompt", {
            text: String(p.text ?? ""),
            ...(overrides ? { overrides } : {}),
          });
        }
        // Persist changed run settings so a reload keeps the mid-session choices.
        if (ok && overrides) {
          runStore.upsert({
            runId: String(p.runId),
            updatedAt: Date.now(),
            ...(overrides.model !== undefined ? { model: overrides.model } : {}),
            ...(overrides.permissionMode !== undefined
              ? {
                  permissionMode:
                    overrides.permissionMode as AgentRunStartParams["permissionMode"],
                }
              : {}),
            ...(overrides.effort !== undefined
              ? { effort: overrides.effort as AgentRunStartParams["effort"] }
              : {}),
          });
        }
        return { ok };
      }),
    );

    await ctx.effect(() =>
      command("agent_run_approve", (p) => ({
        ok: driver.resolveApproval(String(p.approvalId), {
          allow: Boolean(p.allow),
          updatedInput: p.updatedInput,
          always: Boolean(p.always),
        }),
      })),
    );

    await ctx.effect(() =>
      command("agent_run_abort", (p) => ({ ok: driver.abortRun(String(p.runId)) })),
    );

    await ctx.effect(() =>
      command("agent_run_end", (p) => ({ ok: driver.endRun(String(p.runId)) })),
    );

    // Past sessions on disk — the history browser.
    // Per-cwd history is kept for callers that still request it.
    await ctx.effect(() =>
      command("agent_sessions_list", (p) => listSessions(String(p.cwd ?? ""))),
    );
    // (listSessions is async; `command` awaits the returned promise.)
    // Complete cross-backend history, newest
    // first, with user title/archive overrides applied. For an ssh workspace the
    // sessions live on the HOST — listed from the CLIs' own index files in one
    // ssh round-trip; an unreachable host throws (banner, not a lying empty
    // list). Local sidecar meta (rename/archive) applies to both sources.
    await ctx.effect(() =>
      command("agent_sessions_list_all", async (p) => {
        const ws = p.workspace as AgentWorkspace | undefined;
        const raw =
          ws && ws.kind === "ssh"
            ? (await listRemoteSessions(targetFromWorkspace(ws))).map((s) => ({
                ...s,
                workspace: ws,
              }))
            : [...(await listAllSessions()), ...(await listCodexSessions())];
        return raw
          .map((s) => {
            const meta = sessionMetaStore.get(sessionMetaKey(s.backend, s.sessionId));
            return meta
              ? { ...s, name: meta.title ?? s.name, archived: meta.archived }
              : s;
          })
          .sort((a, b) => b.updatedAt - a.updatedAt);
      }),
    );
    // Rename / archive a read-only history session (sidecar; the CLI's own file is
    // never mutated). `title: ""` clears a custom title; `archived` toggles.
    await ctx.effect(() =>
      command("agent_session_meta_set", (p) => {
        sessionMetaStore.set(
          sessionMetaKey(String(p.backend), String(p.sessionId)),
          {
            ...(p.title !== undefined ? { title: String(p.title) } : {}),
            ...(p.archived !== undefined ? { archived: Boolean(p.archived) } : {}),
          },
        );
        return { ok: true };
      }),
    );
    await ctx.effect(() =>
      command("agent_session_messages", (p) => {
        const ws = p.workspace as AgentWorkspace | undefined;
        if (ws && ws.kind === "ssh") {
          // Remote read; failures come back as an error EVENT (rendered as an
          // error block), never as a silently-empty transcript.
          return readRemoteSessionEvents(targetFromWorkspace(ws), {
            backend: p.backend === "codex" ? "codex" : "claude",
            projectSlug: p.projectSlug ? String(p.projectSlug) : undefined,
            sessionId: p.sessionId ? String(p.sessionId) : undefined,
            filePath: p.filePath ? String(p.filePath) : undefined,
          });
        }
        return p.backend === "codex"
          ? readCodexSessionEvents(String(p.filePath ?? ""))
          : readSessionEvents(String(p.projectSlug), String(p.sessionId));
      }),
    );
    // Custom slash-commands for a run's cwd (project + user scope).
    await ctx.effect(() =>
      command("agent_commands_list", (p) => listSlashCommands(String(p.cwd ?? ""))),
    );
    // Full-text search across saved transcripts (message text, not just titles).
    // Remote search is a non-goal: an ssh workspace returns [] and the UI hides
    // the search box instead of lying with empty results.
    await ctx.effect(() =>
      command("agent_sessions_search", (p) => {
        const ws = p.workspace as AgentWorkspace | undefined;
        if (ws && ws.kind === "ssh") return [];
        return searchSessions(
          String(p.query ?? ""),
          p.backend === "claude" || p.backend === "codex" ? p.backend : undefined,
        );
      }),
    );

    // Re-hydrate after a renderer reload: the driver's live runs (resubscribe to
    // replay), merged with persisted-only runs recovered after an app restart
    // (reopen loads their transcript from the backend session file).
    await ctx.effect(() =>
      command("agent_runs_list", (): AgentRunSummary[] => {
        const live = driver.listRuns();
        const liveIds = new Set(live.map((r) => r.runId));
        const persistedOnly: AgentRunSummary[] = runStore
          .list()
          .filter((r) => !liveIds.has(r.runId))
          .map((r) => ({
            runId: r.runId,
            backend: r.backend,
            prompt: r.title,
            cwd: r.cwd,
            sessionId: r.sessionId,
            running: false,
            live: false,
            permissionMode: r.permissionMode,
            model: r.model,
            effort: r.effort,
            workspace: r.workspace,
            rigId: r.rigId ?? undefined,
            title: r.title,
            projectSlug: r.projectSlug ?? undefined,
            createdAt: r.createdAt,
            status: r.status,
            archived: r.archived,
          }));
        return [...live.map((r) => ({ ...r, live: true })), ...persistedOnly];
      }),
    );

    // Drop a persisted run from history (renderer "remove" on a dead run).
    await ctx.effect(() =>
      command("agent_run_forget", (p) => {
        const runId = String(p.runId);
        runStore.remove(runId);
        // The checkpoint log/chain maps are keyed by runId and were never freed —
        // they grew for the app's lifetime (one entry array per run ever started).
        runCheckpoints.delete(runId);
        checkpointChains.delete(runId);
        return { ok: true };
      }),
    );

    // Rename a run (roster/detail title).
    await ctx.effect(() =>
      command("agent_run_rename", (p) => {
        runStore.upsert({
          runId: String(p.runId),
          title: String(p.title ?? "").slice(0, 200),
          updatedAt: Date.now(),
        });
        return { ok: true };
      }),
    );

    // Archive / restore a run (hidden from the active roster).
    await ctx.effect(() =>
      command("agent_run_archive", (p) => {
        runStore.upsert({
          runId: String(p.runId),
          archived: Boolean(p.archived),
          updatedAt: Date.now(),
        });
        return { ok: true };
      }),
    );

    // The run's file checkpoints (turn boundaries where the working tree was
    // snapshotted). Shas are withheld — the renderer only needs turnIndex/at.
    await ctx.effect(() =>
      command("agent_run_checkpoints", (p) => {
        const log = runCheckpoints.get(String(p.runId)) ?? [];
        return log.map((e) => ({ turnIndex: e.turnIndex, at: e.at }));
      }),
    );

    // Rewind the working tree to a run checkpoint (git restore, safety-snapshotted
    // first). Transcript truncation is the renderer's job; this only touches files.
    await ctx.effect(() =>
      command("agent_run_rewind", async (p) => {
        const runId = String(p.runId);
        const turnIndex = Number(p.turnIndex);
        const cwd = String(p.cwd ?? "");
        // Let any in-flight turn snapshot land first so the safety snapshot and
        // the checkpoint log stay ordered.
        await checkpointChains.get(runId);
        const log = runCheckpoints.get(runId) ?? [];
        const entry = log.find((e) => e.turnIndex === turnIndex);
        if (!entry) return { ok: false, error: "no such checkpoint" };
        const r = await checkpoints.restore(cwd || "", entry.cp);
        // Record the safety snapshot so an accidental rewind is itself undoable.
        if (r.safety) {
          log.push({ turnIndex: -1, cp: r.safety, at: Date.now() });
          runCheckpoints.set(runId, log);
        }
        return { ok: r.ok, error: r.error };
      }),
    );

    await ctx.effect(() =>
      command("agent_run_resubscribe", (p, cctx) => {
        const send = cctx.channel(p.onEvent as ChannelMarker) as (e: AgentEvent) => void;
        const runId = String(p.runId);
        return {
          ok: driver.resubscribe(runId, (event) => {
            runtime.events.emit(CODING_AGENT_EVENTS.runEvent, { runId, event });
            send(event);
          }),
        };
      }),
    );

    await ctx.effect(() =>
      command("agent_backends", async (p): Promise<BackendInfo[]> => {
        const ws = p.workspace as AgentWorkspace | undefined;
        // `refresh` busts the availability cache first — "Check again" after the
        // user installed the CLI on the host, without an app restart.
        if (p.refresh) {
          for (const b of BACKENDS) {
            availabilityCache.delete(`${PROBE_EPOCH}:local:${b.bin}`);
            resolvedLocalBins.delete(b.bin);
            clearLocalExecutableCache(b.bin);
            if (ws?.kind === "ssh") {
              availabilityCache.delete(`${PROBE_EPOCH}:${ws.connectionId}:${b.bin}`);
            }
          }
        }
        return Promise.all(
          BACKENDS.map(async (b) => ({
            ...b,
            available:
              ws?.kind === "ssh"
                ? await isAvailableRemote(ws, b.bin)
                : await isAvailableLocal(b.bin),
          })),
        );
      }),
    );

    const capability: CodingAgentsCapability = {
      commands: () => [...handlers.keys()],
      async invoke(name, payload, caller?: CodingAgentsCapabilityCaller) {
        const handler = handlers.get(name);
        if (!handler) throw new Error(`unknown coding-agent command: ${name}`);
        return handler(payload, {
          channel() {
            if (!caller?.eventSink) {
              return () => {};
            }
            return caller.eventSink;
          },
        });
      },
      killAll: killAllCodingAgents,
      liveResources: () =>
        driver.listRuns().map((run) => ({
          id: run.runId,
          label: `${run.backend}: ${run.prompt || run.runId}`,
        })),
    };
    activeCapability = capability;
    await ctx.effect(() => () => {
      killAllCodingAgents();
      if (activeCapability === capability) activeCapability = null;
    });
    ctx.provide("agents.coding-sessions", capability);
  },
  replacementImpact() {
    const resources = activeCapability?.liveResources() ?? [];
    return resources.length === 0
      ? []
      : [{ capability: "agents.coding-sessions", resourceLabel: "running coding-agent sessions", resources }];
  },
};

export default plugin;

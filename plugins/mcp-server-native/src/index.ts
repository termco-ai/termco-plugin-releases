/**
 * Wiring for the app's MCP server: token store + rig registry + protocol +
 * HTTP transport + discovery file. Renderer consumers use the public
 * `mcp.server` capability supplied by this plugin's main entry.
 *
 * The tool SURFACE (app-control tools) is supplied by a `ToolProvider` the
 * Phase 6 bridge registers via `setMcpToolProvider`; until then only the
 * server-side `get_context` / `select_rig` tools exist.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, type WebContents } from "electron";
import { createApprovalGate, createRememberedRules } from "./approvals";
import { createMcpBridge } from "./bridge";
import {
  createProtocol,
  McpToolError,
  type ResolvedRig,
} from "./protocol";
import { createMcpHttpServer, type McpHttpServer } from "./httpServer";
import { createRigRegistry } from "./rigRegistry";
import { createTokenStore, type TokenIdentity } from "./tokens";
import {
  EMPTY_TOOL_PROVIDER,
  GET_CONTEXT_TOOL,
  SELECT_RIG_TOOL,
  type ToolProvider,
} from "./toolProvider";
import { createExecutorSenderRegistry } from "./executorSenders";

/** Default loopback port — fixed so external agent configs survive restarts.
 * Overridable via `TERMCO_MCP_PORT` (E2E uses this to avoid worker collisions;
 * 0 binds an ephemeral port). */
const DEFAULT_PORT = (() => {
  const v = Number(process.env.TERMCO_MCP_PORT);
  return Number.isInteger(v) && v >= 0 ? v : 45817;
})();

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
const randomToken = (): string => randomBytes(32).toString("base64url");

const rigRegistry = createRigRegistry();
let provider: ToolProvider = EMPTY_TOOL_PROVIDER;
let httpServer: McpHttpServer | null = null;
let discoveryPath: string | null = null;

/** Renderer windows registered as MCP tool executors, most-recent first. */
const executorSenders = createExecutorSenderRegistry<WebContents>();
function pushSender(
  wc: WebContents,
  receiver: (message: unknown) => void,
): void {
  executorSenders.push(wc, receiver);
}

/** Send an event only to a live executor window (the first available). */
function sendToExecutor(event: string, payload: unknown): boolean {
  const sender = executorSenders.live()[0];
  if (!sender) return false;
  return executorSenders.dispatch(sender, { event, payload });
}

/**
 * A generic renderer request/response route (approval cards, ask_user/show_ui):
 * emit an event carrying a requestId, then await `mcp_renderer_reply`. Times
 * out so a closed card can never strand the held HTTP call.
 */
const rendererPending = new Map<string, (value: unknown) => void>();
let rendererReqSeq = 0;
function askRenderer<T>(event: string, payload: Record<string, unknown>, timeoutMs: number): Promise<T | null> {
  const requestId = `mcpui-${++rendererReqSeq}`;
  return new Promise<T | null>((resolve) => {
    if (!sendToExecutor(event, { ...payload, requestId })) return resolve(null);
    const timer = setTimeout(() => {
      if (rendererPending.delete(requestId)) resolve(null);
    }, timeoutMs);
    rendererPending.set(requestId, (value) => {
      clearTimeout(timer);
      resolve(value as T);
    });
  });
}

const rememberedRules = createRememberedRules();

/**
 * How a MANAGED run's approval is asked: routed into the coding-agent driver's
 * existing approval flow so the card renders IN THE RUN VIEW (right side),
 * exactly like the run's other tool approvals — not the app-wide overlay
 * (which a native browser view would paint over). Set by the coding-agent
 * module, which owns the driver.
 */
type RunApprovalHandler = (
  runId: string,
  req: { name: string; input: unknown; catastrophic: boolean },
) => Promise<{ allow: boolean; always?: boolean }>;
let runApprovalHandler: RunApprovalHandler | null = null;
export function setMcpRunApprovalHandler(fn: RunApprovalHandler | null): void {
  runApprovalHandler = fn;
}

/** Whether a managed run is CURRENTLY in full-auto — read live so switching a
 * run's autonomy mid-session immediately re-gates its app-control tools
 * (rather than sticking to the mode the run token was minted with). */
let runFullAutoResolver: ((runId: string) => boolean) | null = null;
export function setMcpRunFullAutoResolver(
  fn: ((runId: string) => boolean) | null,
): void {
  runFullAutoResolver = fn;
}

let globalAutoRunResolver: (() => boolean) | null = null;
export function setMcpGlobalAutoRunResolver(
  resolver: (() => boolean) | null,
): void {
  globalAutoRunResolver = resolver;
}

const approvalGate = createApprovalGate({
  rules: rememberedRules,
  autoApproveFor: (identity) =>
    globalAutoRunResolver?.() === true ||
    (identity.kind === "run" && runFullAutoResolver
      ? runFullAutoResolver(identity.runId)
      : identity.autoApprove === true),
  ask: async (req) => {
    // Managed run → the run's own approval flow (card in the run view).
    if (req.identity.kind === "run" && runApprovalHandler) {
      const o = await runApprovalHandler(req.identity.runId, {
        name: req.toolName,
        input: req.input,
        catastrophic: req.catastrophic,
      });
      // The driver owns allow-&-remember for the run view, so we don't also
      // record it in our own rules (`always` dropped on purpose).
      return { allow: o.allow };
    }
    // External agent (user token) → app-wide card (no run view exists).
    const answer = await askRenderer<{ allow: boolean; always?: boolean }>(
      "mcp:approval-request",
      {
        source: {
          kind: req.identity.kind,
          label:
            req.identity.kind === "user"
              ? req.identity.label
              : `Managed run ${req.identity.runId}`,
        },
        rig: req.rig,
        toolName: req.toolName,
        input: req.input,
        catastrophic: req.catastrophic,
      },
      // Match the driver's 9-minute auto-deny so a card can't strand a call.
      9 * 60 * 1000,
    );
    if (!answer) return { allow: false, message: "approval timed out or no window available" };
    return { allow: answer.allow, always: answer.always };
  },
});

const bridge = createMcpBridge({
  senders: () => executorSenders.live(),
  send: executorSenders.route("mcp:tool-request"),
  approvalGate,
});

const tokenStore = createTokenStore({
  read: () => {
    try {
      return readFileSync(tokenFile(), "utf8");
    } catch {
      return null;
    }
  },
  write: (text) => {
    mkdirSync(dataDir(), { recursive: true });
    const target = tokenFile();
    writeFileSync(target, text, { mode: 0o600 });
    try {
      chmodSync(target, 0o600);
    } catch {
      /* best-effort on platforms without chmod */
    }
  },
  hash: sha256,
  randomToken,
  now: () => Date.now(),
});

function dataDir(): string {
  return join(app.getPath("userData"), "mcp-server");
}
function tokenFile(): string {
  return join(dataDir(), "user-tokens.json");
}

/** Resolve the rig for a call: run tokens are fixed to their run's rig; user
 * tokens use their pinned rig, else the session cwd (longest-prefix match). */
function resolveRig(identity: TokenIdentity, sessionCwd: string | null): ResolvedRig | null {
  if (identity.kind === "run") {
    const rig = rigRegistry.byId(identity.rigId);
    return { rigId: identity.rigId, rigName: rig?.name ?? identity.rigId };
  }
  if (identity.rigId) {
    const rig = rigRegistry.byId(identity.rigId);
    return rig ? { rigId: rig.id, rigName: rig.name } : null;
  }
  if (!sessionCwd) return null;
  const rig = rigRegistry.resolveByCwd(sessionCwd);
  return rig ? { rigId: rig.id, rigName: rig.name } : null;
}

const protocol = createProtocol({
  serverVersion: appVersion(),
  newSessionId: () => randomBytes(16).toString("hex"),
  builtinTools: { getContext: GET_CONTEXT_TOOL, selectRig: SELECT_RIG_TOOL },
  toolsFor: (identity) => provider.listTools(identity),
  resolveRig,
  callTool: async ({ identity, rig, toolName, input }) => {
    // Run-token interactive tools render in the run view and hold the call
    // until the user answers (or the run ends). Not routed through the bridge.
    if (toolName === "ask_user" || toolName === "show_ui") {
      if (identity.kind !== "run") {
        throw new McpToolError(
          `"${toolName}" is only available to managed runs.`,
          "run-only",
        );
      }
      if (toolName === "show_ui") {
        // Display-only: fire-and-forget the view into the run's stream.
        void askRenderer("mcp:run-interaction", {
          runId: identity.runId,
          kind: "show_ui",
          input,
        }, 30 * 60 * 1000);
        return { content: [{ type: "text", text: "Rendered the view in the run." }] };
      }
      const answer = await askRenderer<{ answer?: string; skipped?: boolean; stopped?: boolean }>(
        "mcp:run-interaction",
        { runId: identity.runId, kind: "ask_user", input },
        30 * 60 * 1000,
      );
      if (!answer) {
        throw new McpToolError("The question expired or the run ended.", "question-expired");
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(answer),
          },
        ],
      };
    }
    if (toolName === "get_context") {
      const entry = rigRegistry.byId(rig.rigId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                rig: { id: rig.rigId, name: rig.rigName, root: entry?.root ?? null },
                app: { name: "termco", version: appVersion() },
                tokenKind: identity.kind,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    return provider.callTool({ identity, rig, toolName, input });
  },
});

function appVersion(): string {
  try {
    return app.getVersion();
  } catch {
    return "0.0.0";
  }
}

function writeDiscoveryFile(port: number): void {
  // Never touch the user's real ~/.termco during an E2E run (throwaway app).
  if (process.env.TERMCO_E2E === "1") return;
  try {
    const dir = join(homedir(), ".termco");
    mkdirSync(dir, { recursive: true });
    discoveryPath = join(dir, "mcp.json");
    writeFileSync(
      discoveryPath,
      JSON.stringify({ url: `http://127.0.0.1:${port}/mcp`, startedAt: Date.now() }, null, 2),
      { mode: 0o600 },
    );
  } catch {
    /* discovery is a convenience; ignore write failures */
  }
}

function removeDiscoveryFile(): void {
  if (!discoveryPath) return;
  try {
    rmSync(discoveryPath, { force: true });
  } catch {
    /* ignore */
  }
  discoveryPath = null;
}

/** Called by the Phase 6 bridge to install the app-control tool surface. */
export function setMcpToolProvider(p: ToolProvider): void {
  provider = p;
}

/** The tool bridge (surface + call routing) — exported for Phase 7/8 wiring. */
export const mcpBridge = bridge;

/** Mint a run token (coding-agent driver, at spawn). `autoApprove` mirrors the
 * run's permission posture (bypass-mode runs don't double-prompt). */
export function mintRunToken(runId: string, rigId: string, autoApprove = false): string {
  return tokenStore.registerRunToken(runId, rigId, autoApprove);
}
/** Release a run's token + its remembered rules (coding-agent driver, run end). */
export function releaseRunToken(runId: string): void {
  tokenStore.releaseRunToken(runId);
  rememberedRules.forget({ kind: "run", token: "", runId, rigId: "", autoApprove: false });
}
/** The server's base URL, or null if not listening. */
export function mcpServerUrl(): string | null {
  const port = httpServer?.port();
  return port ? `http://127.0.0.1:${port}/mcp` : null;
}

/** Start the server (idempotent). Preferred port from prefs, else default. */
export async function startMcpServer(port = DEFAULT_PORT): Promise<void> {
  if (httpServer) return;
  tokenStore.load();
  httpServer = createMcpHttpServer({
    tokens: tokenStore,
    protocol,
    onError: (where, err) =>
      console.error(`[mcp-server] ${where}:`, err instanceof Error ? err.message : err),
  });
  try {
    const bound = await httpServer.listen(port);
    writeDiscoveryFile(bound);
  } catch (err) {
    console.error("[mcp-server] failed to listen:", err);
    httpServer = null;
    throw err;
  }
}

/** Stop the server + clean up the discovery file (app quit). */
export async function stopMcpServer(): Promise<void> {
  removeDiscoveryFile();
  if (httpServer) {
    await httpServer.close();
    httpServer = null;
  }
}

/** Test/introspection: the shared registries + protocol. */
export const _internals = { rigRegistry, tokenStore, protocol };

// --- narrow accessors for this provider's main capability --------------------

/** A window announces it can execute MCP tools (hosts the live tab state). */
export function registerExecutorSender(
  wc: WebContents,
  receiver: (message: unknown) => void,
): void {
  pushSender(wc, receiver);
}

/** Remove a renderer generation from the executor pool during plugin cleanup. */
export function unregisterExecutorSender(wc: WebContents): void {
  executorSenders.remove(wc);
}

/** Resolve a pending renderer request (approval card / ask_user / show_ui). */
export function resolveRendererReply(requestId: string, value: unknown): void {
  const resolve = rendererPending.get(requestId);
  if (resolve) {
    rendererPending.delete(requestId);
    resolve(value);
  }
}

/** Whether the HTTP transport currently exists. */
export function mcpServerRunning(): boolean {
  return Boolean(httpServer);
}

export { McpToolError };
// Owned by the mcp-server-native provider plugin.

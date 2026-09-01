/**
 * SessionManager — the one owner of all running language servers, keyed by
 * (workspace scope × server × project root). Handles spawn-on-first-open, doc
 * routing, idle shutdown, crash restart with backoff, config-change restarts,
 * and per-window cleanup. Transports are picked per workspace env (local now,
 * ssh via the remote agent in the ssh transport module).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { watch } from "chokidar";
import type * as lsp from "vscode-languageserver-protocol";
import type { SshWorkspace } from "@termco/ssh-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { onConfigChange, serverById, serversForLanguage } from "./config";
import { installServer, resolveLocalLaunch } from "./install";
import { LspSession } from "./session";
import { spawnLocalTransport, type LspTransport } from "./transport";
import {
  envScopeKey,
  sessionKeyOf,
  substituteLaunchArgs,
  type DocChange,
  type LspServerConfig,
  type SessionState,
  type SessionStatus,
} from "./types";

const IDLE_SHUTDOWN_MS = 5 * 60_000;
const RESTART_BACKOFF_MS = [1_000, 4_000, 15_000];
const RESTART_WINDOW_MS = 3 * 60_000;
const MAX_DOC_BYTES = 2 * 1024 * 1024;
/** Monorepos can fan out one server per package — cap the fleet per scope
 * (a tsserver instance easily takes hundreds of MB). */
const MAX_SESSIONS_PER_SCOPE = 6;

const isSshWorkspace = (workspace: WorkspaceEnv): workspace is SshWorkspace =>
  Boolean(workspace && workspace.kind === "ssh");

export type DocOpenResult = {
  active: boolean;
  sessionKey?: string;
  serverId?: string;
  reason?: "no-server" | "disabled" | "missing" | "toolarge" | "error";
  detail?: string;
  /** Server-advertised trigger characters, for the renderer's UX wiring. */
  triggers?: {
    completion: string[];
    signature: string[];
    signatureRetrigger: string[];
  };
  /** Secondary (linter-class) sessions attached to this doc — the renderer
   * merges their completions into the popup via these keys. */
  secondaries?: Array<{ sessionKey: string; serverId: string }>;
};

type Managed = {
  key: string;
  scopeKey: string;
  ws: WorkspaceEnv;
  config: LspServerConfig;
  root: string;
  state: SessionState;
  session: LspSession | null;
  /** Resolves when the server finished (or failed) initializing. */
  ready: Promise<void> | null;
  idleTimer: NodeJS.Timeout | null;
  restartTimes: number[];
  restartTimer: NodeJS.Timeout | null;
  lastError?: string;
  /** Best-effort chokidar watch on root config/lock files (local only). */
  configWatcher: { close(): Promise<void> } | null;
};

export type DiagnosticsBroadcast = (payload: {
  scopeKey: string;
  path: string;
  /** Producing server id; "*" clears every server's slice for the doc. */
  serverId: string;
  version?: number;
  diagnostics: lsp.Diagnostic[];
}) => void;

export type StatusBroadcast = (sessions: SessionStatus[]) => void;

/** Core walk: outermost match of the best-priority marker, or null. */
export function walkRootLocal(
  filePath: string,
  markers: string[],
  rigRoot: string | null,
): string | null {
  const stopAt = rigRoot ?? homedir();
  let bestPriority = markers.length;
  let bestDir: string | null = null;
  let dir = dirname(filePath);
  for (;;) {
    for (let i = 0; i < markers.length && i <= bestPriority; i++) {
      if (existsSync(join(dir, markers[i]))) {
        // Equal priority higher up overwrites → outermost match wins.
        bestPriority = i;
        bestDir = dir;
        break;
      }
    }
    if (dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    // Never escape the rig root upward.
    if (rigRoot && !dir.startsWith(rigRoot)) break;
    dir = parent;
  }
  return bestDir;
}

/** Walk up from `filePath` looking for root markers; outermost match of the
 * best-priority marker wins (monorepos root at the repo, not the package). */
export function findProjectRootLocal(
  filePath: string,
  rootMarkers: string[],
  rigRoot: string | null,
): string {
  return (
    walkRootLocal(filePath, rootMarkers, rigRoot) ??
    rigRoot ??
    dirname(filePath)
  );
}

/** Synthetic renderer id for ephemeral (AI-initiated) doc opens. */
const EPHEMERAL_SENDER = -1;

export class SessionManager {
  private readonly sessions = new Map<string, Managed>();
  /** (scopeKey NUL path) → session keys; index 0 is the PRIMARY session,
   * the rest are secondary (linter-class) sessions on the same doc. */
  private readonly docIndex = new Map<string, string[]>();
  private readonly senderDocs = new Map<number, Set<string>>();
  private readonly watchedSenders = new Map<
    number,
    {
      sender: {
        removeListener?(event: "destroyed", cb: () => void): unknown;
      };
      onDestroyed: () => void;
    }
  >();
  /** Last published diagnostics per doc — the AI tools read from here. */
  private readonly latestDiagnostics = new Map<string, lsp.Diagnostic[]>();
  private readonly diagnosticsWaiters = new Map<string, Array<() => void>>();

  private readonly disposeConfigChange: () => void;

  constructor(
    private readonly broadcastDiagnostics: DiagnosticsBroadcast,
    private readonly broadcastStatus: StatusBroadcast,
  ) {
    this.disposeConfigChange = onConfigChange((ids) => this.onConfigChanged(ids));
  }

  private emitDiagnostics(payload: {
    scopeKey: string;
    path: string;
    /** Producing server id; "*" clears every server's slice for the doc. */
    serverId: string;
    version?: number;
    diagnostics: lsp.Diagnostic[];
  }): void {
    const base = docKey(payload.scopeKey, payload.path);
    if (payload.serverId === "*") {
      for (const key of [...this.latestDiagnostics.keys()]) {
        if (key.startsWith(`${base}\u0000`)) this.latestDiagnostics.delete(key);
      }
    } else {
      const key = `${base}\u0000${payload.serverId}`;
      if (payload.diagnostics.length === 0) this.latestDiagnostics.delete(key);
      else this.latestDiagnostics.set(key, payload.diagnostics);
    }
    const waiters = this.diagnosticsWaiters.get(base);
    if (waiters) {
      this.diagnosticsWaiters.delete(base);
      for (const resolve of waiters) resolve();
    }
    this.broadcastDiagnostics(payload);
  }

  /** Merged cached diagnostics of one doc across all its servers. */
  private cachedForDoc(scopeKey: string, path: string): lsp.Diagnostic[] {
    const prefix = `${docKey(scopeKey, path)}\u0000`;
    const out: lsp.Diagnostic[] = [];
    for (const [key, diagnostics] of this.latestDiagnostics) {
      if (key.startsWith(prefix)) out.push(...diagnostics);
    }
    return out;
  }

  diagnosticSlices(
    ws: WorkspaceEnv,
    path: string,
  ): Array<{ serverId: string; diagnostics: lsp.Diagnostic[] }> {
    const prefix = `${docKey(envScopeKey(ws), path)}\u0000`;
    const slices: Array<{ serverId: string; diagnostics: lsp.Diagnostic[] }> = [];
    for (const [key, diagnostics] of this.latestDiagnostics) {
      if (!key.startsWith(prefix)) continue;
      slices.push({ serverId: key.slice(prefix.length), diagnostics });
    }
    return slices;
  }

  private hasCachedForDoc(scopeKey: string, path: string): boolean {
    const prefix = `${docKey(scopeKey, path)}\u0000`;
    for (const key of this.latestDiagnostics.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  private waitForDiagnostics(
    scopeKey: string,
    path: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const key = docKey(scopeKey, path);
      const timer = setTimeout(() => resolve(), timeoutMs);
      const list = this.diagnosticsWaiters.get(key) ?? [];
      list.push(() => {
        clearTimeout(timer);
        resolve();
      });
      this.diagnosticsWaiters.set(key, list);
    });
  }

  /** All cached diagnostics of a workspace scope (open docs only). */
  cachedDiagnostics(
    ws: WorkspaceEnv,
  ): Array<{ path: string; diagnostics: lsp.Diagnostic[] }> {
    const scopeKey = envScopeKey(ws);
    const prefix = `${scopeKey}\u0000`;
    const byPath = new Map<string, lsp.Diagnostic[]>();
    for (const [key, diagnostics] of this.latestDiagnostics) {
      if (!key.startsWith(prefix)) continue;
      // key = scope NUL path NUL serverId — merge all servers per path.
      const rest = key.slice(prefix.length);
      const path = rest.slice(0, rest.lastIndexOf("\u0000"));
      byPath.set(path, [...(byPath.get(path) ?? []), ...diagnostics]);
    }
    return [...byPath.entries()].map(([path, diagnostics]) => ({
      path,
      diagnostics,
    }));
  }

  /**
   * Diagnostics for one file, for the AI tools: cached for open docs (with a
   * short wait for the first publish), or via an ephemeral didOpen→publish→
   * didClose round trip using disk content supplied by `readText`.
   */
  async diagnosticsForFile(
    ws: WorkspaceEnv,
    rigRoot: string | null,
    path: string,
    cmLanguageId: string,
    lspLanguage: string,
    readText: () => Promise<string | null>,
  ): Promise<{ diagnostics: lsp.Diagnostic[] } | { error: string }> {
    const scopeKey = envScopeKey(ws);
    const session = this.sessionForDoc(ws, path);
    if (session?.hasDoc(path)) {
      if (!this.hasCachedForDoc(scopeKey, path)) {
        await this.waitForDiagnostics(scopeKey, path, 1_500);
      }
      return { diagnostics: this.cachedForDoc(scopeKey, path) };
    }
    const text = await readText();
    if (text == null) return { error: "file is not readable text" };
    const opened = await this.docOpen(
      ws,
      rigRoot,
      path,
      cmLanguageId,
      lspLanguage,
      text,
      EPHEMERAL_SENDER,
    );
    if (!opened.active) {
      return { error: `no language server available (${opened.reason})` };
    }
    await this.waitForDiagnostics(scopeKey, path, 2_500);
    const diagnostics = this.cachedForDoc(scopeKey, path);
    this.docClose(ws, path, EPHEMERAL_SENDER);
    return { diagnostics };
  }

  // ── document lifecycle ───────────────────────────────────────────────────

  /**
   * Pick the servers for a file: the most SPECIFIC enabled primary (a server
   * whose projectMarkers matched between the file and the rig root beats
   * marker-less generics — e.g. ngserver takes .html only next to an
   * angular.json), plus every matching secondary (linter-class) server.
   */
  private async selectServers(
    ws: WorkspaceEnv,
    path: string,
    cmLanguageId: string,
    rigRoot: string | null,
  ): Promise<{ primary: LspServerConfig | null; secondaries: LspServerConfig[] }> {
    const candidates = serversForLanguage(cmLanguageId);
    const matchedSpecific = new Set<string>();
    const eligible: LspServerConfig[] = [];
    for (const candidate of candidates) {
      const markers = candidate.projectMarkers;
      if (!markers || markers.length === 0) {
        eligible.push(candidate);
        continue;
      }
      const found = isSshWorkspace(ws)
        ? (await this.probeRootRemote(ws, path, markers, rigRoot)) != null
        : walkRootLocal(path, markers, rigRoot) != null;
      if (found) {
        eligible.push(candidate);
        matchedSpecific.add(candidate.id);
      }
    }
    const primaries = eligible.filter((c) => (c.role ?? "primary") === "primary");
    const primary =
      primaries.find((c) => matchedSpecific.has(c.id)) ?? primaries[0] ?? null;
    const secondaries = eligible.filter((c) => c.role === "secondary");
    return { primary, secondaries };
  }

  async docOpen(
    ws: WorkspaceEnv,
    rigRoot: string | null,
    path: string,
    cmLanguageId: string,
    lspLanguage: string,
    text: string,
    senderId: number,
  ): Promise<DocOpenResult> {
    if (text.length > MAX_DOC_BYTES) return { active: false, reason: "toolarge" };
    // TODO(M5/WSL): wsl rigs need command translation; explicit no-server
    // instead of silently spawning against host paths.
    if (ws && ws.kind === "wsl") return { active: false, reason: "no-server" };
    const { primary: config, secondaries } = await this.selectServers(
      ws,
      path,
      cmLanguageId,
      rigRoot,
    );
    if (!config) return { active: false, reason: "no-server" };

    const scopeKey = envScopeKey(ws);
    const root = isSshWorkspace(ws)
      ? await this.findRootRemote(ws, path, config.rootMarkers, rigRoot)
      : findProjectRootLocal(path, config.rootMarkers, rigRoot);
    const key = sessionKeyOf(scopeKey, config.id, root);

    let managed = this.sessions.get(key);
    if (!managed || managed.state === "stopped") {
      managed = this.createManaged(key, scopeKey, ws, config, root);
    }
    if (managed.state === "error") {
      return {
        active: false,
        sessionKey: key,
        serverId: config.id,
        reason: this.errorReason(managed),
        detail: managed.lastError,
      };
    }

    try {
      await managed.ready;
    } catch {
      return {
        active: false,
        sessionKey: key,
        serverId: config.id,
        reason: this.errorReason(managed),
        detail: managed.lastError,
      };
    }
    const session = managed.session;
    if (!session || managed.state !== "running") {
      return {
        active: false,
        sessionKey: key,
        serverId: config.id,
        reason: this.errorReason(managed),
        detail: managed.lastError,
      };
    }

    session.openDoc(path, lspLanguage, text, senderId);
    this.addDocSession(docKey(scopeKey, path), key, true);
    this.trackSender(senderId, docKey(scopeKey, path));
    this.clearIdleTimer(managed);
    this.emitStatus();

    // Secondaries (linter class) attach in the background — their session keys
    // are deterministic, so the renderer can address them before they're ready.
    const secondaryInfos: Array<{ sessionKey: string; serverId: string }> = [];
    for (const secondary of secondaries) {
      const secRoot = isSshWorkspace(ws)
        ? await this.findRootRemote(ws, path, secondary.rootMarkers, rigRoot)
        : findProjectRootLocal(path, secondary.rootMarkers, rigRoot);
      const secKey = sessionKeyOf(scopeKey, secondary.id, secRoot);
      secondaryInfos.push({ sessionKey: secKey, serverId: secondary.id });
      void this.openSecondary(
        ws,
        scopeKey,
        secondary,
        secRoot,
        path,
        lspLanguage,
        senderId,
        key,
      ).catch(() => {});
    }

    const caps = session.serverCapabilities;
    return {
      active: true,
      sessionKey: key,
      serverId: config.id,
      triggers: {
        completion: caps.completionProvider?.triggerCharacters ?? [],
        signature: caps.signatureHelpProvider?.triggerCharacters ?? [],
        signatureRetrigger:
          caps.signatureHelpProvider?.retriggerCharacters ?? [],
      },
      ...(secondaryInfos.length ? { secondaries: secondaryInfos } : {}),
    };
  }

  /** Best-effort attach of a secondary session — never fails the doc. */
  private async openSecondary(
    ws: WorkspaceEnv,
    scopeKey: string,
    config: LspServerConfig,
    root: string,
    path: string,
    lspLanguage: string,
    senderId: number,
    primaryKey: string,
  ): Promise<void> {
    const key = sessionKeyOf(scopeKey, config.id, root);
    let managed = this.sessions.get(key);
    if (!managed || managed.state === "stopped") {
      managed = this.createManaged(key, scopeKey, ws, config, root);
    }
    try {
      await managed.ready;
    } catch {
      return;
    }
    const session = managed.session;
    if (!session || managed.state !== "running") return;
    // The doc may have closed while we were starting — the primary's copy is
    // the truth, and it also carries all edits made in the meantime.
    const text = this.sessions.get(primaryKey)?.session?.docText(path);
    if (text == null) return;
    session.openDoc(path, lspLanguage, text, senderId);
    this.addDocSession(docKey(scopeKey, path), key, false);
    this.clearIdleTimer(managed);
    this.emitStatus();
  }

  private addDocSession(dk: string, sessionKey: string, primary: boolean): void {
    const list = this.docIndex.get(dk) ?? [];
    if (list.includes(sessionKey)) return;
    if (primary) list.unshift(sessionKey);
    else list.push(sessionKey);
    this.docIndex.set(dk, list);
  }

  /** Remove one session from a doc's list; clears diagnostics when empty. */
  private removeDocSession(
    dk: string,
    sessionKey: string,
    scopeKey: string,
    path: string,
  ): void {
    const list = this.docIndex.get(dk);
    if (!list) return;
    const next = list.filter((k) => k !== sessionKey);
    if (next.length === 0) {
      this.docIndex.delete(dk);
      this.emitDiagnostics({ scopeKey, path, serverId: "*", diagnostics: [] });
    } else {
      this.docIndex.set(dk, next);
    }
  }

  docChange(
    ws: WorkspaceEnv,
    path: string,
    version: number,
    changes: DocChange[],
    checksum?: number,
  ): { resync?: true } {
    // Fan out only to sessions that already hold the doc — a secondary still
    // starting up gets the then-current text at its own didOpen.
    const sessions = this.sessionsForDoc(ws, path).filter((s) => s.hasDoc(path));
    if (sessions.length === 0) return { resync: true };
    let resync = false;
    for (const session of sessions) {
      if (session.changeDoc(path, version, changes, checksum).resync) {
        resync = true;
      }
    }
    return resync ? { resync: true } : {};
  }

  docResync(ws: WorkspaceEnv, path: string, version: number, text: string): void {
    for (const session of this.sessionsForDoc(ws, path)) {
      if (session.hasDoc(path)) session.resyncDoc(path, version, text);
    }
  }

  docClose(ws: WorkspaceEnv, path: string, senderId: number): void {
    const scopeKey = envScopeKey(ws);
    const dk = docKey(scopeKey, path);
    const keys = this.docIndex.get(dk);
    if (!keys) return;
    let anyOpen = false;
    for (const key of [...keys]) {
      const managed = this.sessions.get(key);
      const session = managed?.session;
      if (!managed || !session) continue;
      session.closeDoc(path, senderId);
      if (session.hasDoc(path)) anyOpen = true;
      this.maybeStartIdleTimer(managed);
    }
    if (!anyOpen) {
      this.docIndex.delete(dk);
      // Servers aren't obliged to publish empty diagnostics on close — clear
      // the gutter (and the AI-facing cache) deterministically ourselves.
      this.emitDiagnostics({ scopeKey, path, serverId: "*", diagnostics: [] });
    }
    this.senderDocs.get(senderId)?.delete(dk);
    this.emitStatus();
  }

  docSave(ws: WorkspaceEnv, path: string): void {
    for (const session of this.sessionsForDoc(ws, path)) {
      if (session.hasDoc(path)) session.saveDoc(path);
    }
  }

  // ── feature requests ─────────────────────────────────────────────────────

  async hover(ws: WorkspaceEnv, path: string, position: lsp.Position) {
    // Primary first; secondaries (e.g. tailwind's class previews) fall back.
    for (const session of this.sessionsForDoc(ws, path)) {
      if (!session.hasDoc(path)) continue;
      try {
        const result = await session.hover(path, position);
        if (result) return result;
      } catch {
        // a dead secondary must not break hover
      }
    }
    return null;
  }

  async definition(ws: WorkspaceEnv, path: string, position: lsp.Position) {
    return (
      (await this.sessionForDoc(ws, path)?.definition(path, position)) ?? null
    );
  }

  async completion(
    ws: WorkspaceEnv,
    path: string,
    position: lsp.Position,
    context?: lsp.CompletionContext,
  ) {
    return (
      (await this.sessionForDoc(ws, path)?.completion(path, position, context)) ??
      null
    );
  }

  async resolveCompletion(sessionKey: string, item: lsp.CompletionItem) {
    const session = this.sessions.get(sessionKey)?.session;
    return session ? session.resolveCompletion(item) : item;
  }

  /** Completion against ONE specific session (secondary popup sources). */
  async completionBySession(
    sessionKey: string,
    path: string,
    position: lsp.Position,
    context?: lsp.CompletionContext,
  ) {
    const session = this.sessions.get(sessionKey)?.session;
    if (!session?.hasDoc(path)) return null;
    return (await session.completion(path, position, context)) ?? null;
  }

  async signatureHelp(
    ws: WorkspaceEnv,
    path: string,
    position: lsp.Position,
    context?: lsp.SignatureHelpContext,
  ) {
    return (
      (await this.sessionForDoc(ws, path)?.signatureHelp(path, position, context)) ??
      null
    );
  }

  /** Whole-document formatting via the primary session; null when the doc
   * isn't open or the server can't format. */
  async formatViaLsp(ws: WorkspaceEnv, path: string): Promise<string | null> {
    const session = this.sessionForDoc(ws, path);
    if (!session?.hasDoc(path)) return null;
    const edits = await session.formatting(path, {
      tabSize: 2,
      insertSpaces: true,
    });
    if (!edits || edits.length === 0) return null;
    const text = session.docText(path);
    if (text == null) return null;
    const { applyTextEdits } = await import("./format");
    return applyTextEdits(text, edits);
  }

  /** Semantic tokens from the doc's PRIMARY session, with its legend. */
  async semanticTokens(ws: WorkspaceEnv, path: string) {
    const session = this.sessionForDoc(ws, path);
    if (!session?.hasDoc(path)) return null;
    const legend = session.semanticTokensLegend;
    if (!legend) return null;
    const tokens = await session.semanticTokens(path);
    if (!tokens?.data?.length) return null;
    return {
      legend: {
        tokenTypes: legend.tokenTypes,
        tokenModifiers: legend.tokenModifiers,
      },
      data: tokens.data,
    };
  }

  async pullDiagnostics(ws: WorkspaceEnv, path: string) {
    const results: lsp.Diagnostic[] = [];
    let any = false;
    for (const session of this.sessionsForDoc(ws, path)) {
      if (!session.hasDoc(path)) continue;
      const pulled = await session.pullDiagnostics(path);
      if (pulled) {
        any = true;
        results.push(...pulled);
      }
    }
    return any ? results : null;
  }

  /** All sessions attached to a doc; index 0 is the primary. */
  sessionsForDoc(ws: WorkspaceEnv, path: string): LspSession[] {
    const keys = this.docIndex.get(docKey(envScopeKey(ws), path)) ?? [];
    return keys
      .map((key) => this.sessions.get(key)?.session)
      .filter((session): session is LspSession => session != null);
  }

  /** The doc's PRIMARY session (answers definition/signature/completions). */
  sessionForDoc(ws: WorkspaceEnv, path: string): LspSession | null {
    return this.sessionsForDoc(ws, path)[0] ?? null;
  }

  // ── status / lifecycle ───────────────────────────────────────────────────

  statusList(): SessionStatus[] {
    return [...this.sessions.values()].map((m) => ({
      sessionKey: m.key,
      serverId: m.config.id,
      scopeKey: m.scopeKey,
      root: m.root,
      state: m.state,
      openDocs: m.session?.openDocCount ?? 0,
      pid: m.session?.pid,
      lastError: m.lastError,
    }));
  }

  async restartSession(sessionKey: string): Promise<void> {
    const managed = this.sessions.get(sessionKey);
    if (!managed) return;
    managed.restartTimes = [];
    await this.restart(managed);
  }

  /** A renderer window died — drop its refs everywhere. */
  senderDestroyed(senderId: number): void {
    const docKeys = this.senderDocs.get(senderId);
    this.senderDocs.delete(senderId);
    if (!docKeys) return;
    for (const managed of this.sessions.values()) {
      const session = managed.session;
      if (!session) continue;
      for (const closedPath of session.dropRefsOf(senderId)) {
        this.removeDocSession(
          docKey(managed.scopeKey, closedPath),
          managed.key,
          managed.scopeKey,
          closedPath,
        );
      }
      this.maybeStartIdleTimer(managed);
    }
    this.emitStatus();
  }

  async shutdownAll(): Promise<void> {
    const all = [...this.sessions.values()];
    this.sessions.clear();
    this.docIndex.clear();
    await Promise.allSettled(
      all.map((m) => {
        this.clearIdleTimer(m);
        if (m.restartTimer) clearTimeout(m.restartTimer);
        m.state = "stopped";
        return m.session?.shutdown();
      }),
    );
  }

  /** Synchronous hard kill for the app-quit path — a live language-server
   * child (piped stdio) keeps the Electron process from exiting. */
  killAllSync(): void {
    for (const m of this.sessions.values()) {
      this.clearIdleTimer(m);
      if (m.restartTimer) clearTimeout(m.restartTimer);
      m.state = "stopped";
      m.session?.disposeAfterCrash();
      m.session = null;
    }
    this.sessions.clear();
    this.docIndex.clear();
  }

  /** Release every process, timer, and listener owned by this manager. */
  disposeSync(): void {
    this.killAllSync();
    this.disposeConfigChange();
    for (const { sender, onDestroyed } of this.watchedSenders.values()) {
      sender.removeListener?.("destroyed", onDestroyed);
    }
    this.watchedSenders.clear();
    this.senderDocs.clear();
    this.latestDiagnostics.clear();
    for (const waiters of this.diagnosticsWaiters.values()) {
      for (const resolve of waiters) resolve();
    }
    this.diagnosticsWaiters.clear();
  }

  /** Hook a webContents' destroyed event exactly once per sender. */
  watchSender(sender: {
    id: number;
    once(event: "destroyed", cb: () => void): unknown;
    removeListener?(event: "destroyed", cb: () => void): unknown;
  }): void {
    if (this.watchedSenders.has(sender.id)) return;
    const onDestroyed = () => {
      this.watchedSenders.delete(sender.id);
      // This fires mid-window-teardown; a throw here becomes an uncaught
      // exception → Electron's modal error dialog → quit hangs forever.
      try {
        this.senderDestroyed(sender.id);
      } catch {
        // cleanup is best-effort during teardown
      }
    };
    this.watchedSenders.set(sender.id, { sender, onDestroyed });
    sender.once("destroyed", onDestroyed);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private createManaged(
    key: string,
    scopeKey: string,
    ws: WorkspaceEnv,
    config: LspServerConfig,
    root: string,
  ): Managed {
    this.evictForCap(scopeKey);
    const managed: Managed = {
      key,
      scopeKey,
      ws,
      config,
      root,
      state: "starting",
      session: null,
      ready: null,
      idleTimer: null,
      restartTimes: [],
      restartTimer: null,
      configWatcher: null,
    };
    this.sessions.set(key, managed);
    managed.ready = this.start(managed);
    // Callers await `ready` themselves; swallow here so a failed spawn doesn't
    // surface as an unhandled rejection.
    managed.ready.catch(() => {});
    this.emitStatus();
    return managed;
  }

  private async start(managed: Managed): Promise<void> {
    try {
      const transport = await this.spawnTransport(managed);
      const session = new LspSession(
        transport,
        managed.config,
        managed.root,
        (path, version, diagnostics) =>
          this.emitDiagnostics({
            scopeKey: managed.scopeKey,
            path,
            serverId: managed.config.id,
            version,
            diagnostics,
          }),
      );
      managed.session = session;
      session.onTransportExit(() => this.onSessionExit(managed, session));
      await session.initialize();
      managed.state = "running";
      managed.lastError = undefined;
      this.armConfigWatcher(managed);
    } catch (e) {
      managed.state = "error";
      managed.lastError ??= shortError(e, managed.session?.stderrTail());
      managed.session?.disposeAfterCrash();
      managed.session = null;
      this.emitStatus();
      throw e;
    }
    this.emitStatus();
  }

  private async spawnTransport(managed: Managed): Promise<LspTransport> {
    if (isSshWorkspace(managed.ws)) {
      // Lazy import: the ssh transport pulls in the connection stack, which
      // tests for the local path shouldn't need.
      const { spawnSshTransport } = await import("./sshTransport");
      return spawnSshTransport(managed.ws, managed.config, managed.root);
      // (arg substitution for ssh happens inside resolveRemoteLaunch)
    }
    let launch = await resolveLocalLaunch(managed.config);
    if (!launch && managed.config.autoInstall) {
      // Zed-model first-open experience: npm-backed curated servers install
      // themselves into the managed dir the first time a matching file opens.
      // installServer rejects with npm's stderr tail → error status in the UI.
      managed.lastError = "installing…";
      this.emitStatus();
      await installServer(managed.config, () => {});
      managed.lastError = undefined;
      launch = await resolveLocalLaunch(managed.config);
    }
    if (!launch) {
      throw new MissingServerError(managed.config.command);
    }
    return spawnLocalTransport(
      launch.command,
      substituteLaunchArgs(launch.args, {
        root: managed.root,
        serverModules: launch.serverModules,
      }),
      managed.root,
      launch.env,
    );
  }

  private onSessionExit(managed: Managed, session: LspSession): void {
    // Ignore exits of sessions we already replaced or intentionally stopped.
    if (managed.session !== session) return;
    if (managed.state === "stopped" || managed.state === "error") return;
    if (managed.state === "starting") {
      managed.state = "error";
      managed.lastError = shortError(
        new Error("language server exited during initialization"),
        session.stderrTail(),
      );
      session.disposeAfterCrash();
      managed.session = null;
      this.emitStatus();
      return;
    }
    const docs = session.snapshotDocs();
    session.disposeAfterCrash();
    managed.session = null;
    if (docs.length === 0) {
      managed.state = "stopped";
      this.sessions.delete(managed.key);
      this.emitStatus();
      return;
    }
    const now = Date.now();
    managed.restartTimes = managed.restartTimes.filter(
      (t) => now - t < RESTART_WINDOW_MS,
    );
    if (managed.restartTimes.length >= RESTART_BACKOFF_MS.length) {
      managed.state = "error";
      managed.lastError = `crashed repeatedly${tailNote(session.stderrTail())}`;
      this.emitStatus();
      return;
    }
    const delay = RESTART_BACKOFF_MS[managed.restartTimes.length];
    managed.restartTimes.push(now);
    managed.state = "restarting";
    this.emitStatus();
    managed.restartTimer = setTimeout(() => {
      managed.restartTimer = null;
      void this.respawnWithDocs(managed, docs);
    }, delay);
  }

  private async respawnWithDocs(
    managed: Managed,
    docs: ReturnType<LspSession["snapshotDocs"]>,
  ): Promise<void> {
    managed.state = "starting";
    managed.ready = this.start(managed);
    try {
      await managed.ready;
    } catch {
      return; // start() already recorded the error state
    }
    const session = managed.session;
    if (!session) return;
    for (const doc of docs) {
      for (const ref of doc.refs) {
        session.openDoc(doc.path, doc.languageId, doc.text, ref);
      }
      this.addDocSession(
        docKey(managed.scopeKey, doc.path),
        managed.key,
        (managed.config.role ?? "primary") === "primary",
      );
    }
    this.emitStatus();
  }

  private async restart(managed: Managed): Promise<void> {
    const session = managed.session;
    const docs = session?.snapshotDocs() ?? [];
    managed.state = "restarting";
    this.emitStatus();
    await session?.shutdown();
    managed.session = null;
    await this.respawnWithDocs(managed, docs);
  }

  private onConfigChanged(ids: string[]): void {
    for (const managed of [...this.sessions.values()]) {
      if (!ids.includes(managed.config.id)) continue;
      const fresh = serverById(managed.config.id);
      if (!fresh || !fresh.enabled) {
        this.dropSession(managed);
        continue;
      }
      managed.config = fresh;
      managed.restartTimes = [];
      void this.restart(managed);
    }
  }

  private dropSession(managed: Managed): void {
    this.clearIdleTimer(managed);
    if (managed.restartTimer) clearTimeout(managed.restartTimer);
    void managed.configWatcher?.close().catch(() => {});
    managed.configWatcher = null;
    managed.state = "stopped";
    for (const doc of managed.session?.snapshotDocs() ?? []) {
      this.removeDocSession(
        docKey(managed.scopeKey, doc.path),
        managed.key,
        managed.scopeKey,
        doc.path,
      );
      // Clear this server's diagnostics slice even when other sessions remain.
      this.emitDiagnostics({
        scopeKey: managed.scopeKey,
        path: doc.path,
        serverId: managed.config.id,
        diagnostics: [],
      });
    }
    for (const [dk, keys] of this.docIndex) {
      if (keys.includes(managed.key)) {
        this.docIndex.set(
          dk,
          keys.filter((k) => k !== managed.key),
        );
      }
    }
    void managed.session?.shutdown();
    managed.session = null;
    this.sessions.delete(managed.key);
    this.emitStatus();
  }

  /** Watch root config/lock files and forward changes as
   * workspace/didChangeWatchedFiles, so e.g. a package install or tsconfig
   * edit re-checks the project without a restart. Local scopes only —
   * remote roots would need the agent's watcher (follow-up). */
  private armConfigWatcher(managed: Managed): void {
    if (managed.configWatcher || isSshWorkspace(managed.ws)) return;
    if (managed.ws && managed.ws.kind === "wsl") return;
    const files = [
      ...managed.config.rootMarkers.filter((m) => m !== ".git"),
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
      "Cargo.lock",
      "go.sum",
    ].map((name) => join(managed.root, name));
    try {
      const watcher = watch(files, {
        ignoreInitial: true,
        followSymlinks: false,
      });
      watcher.on("all", (_event: string, path: string) => {
        managed.session?.notifyWatchedFileChanged(path);
      });
      watcher.on("error", () => {});
      managed.configWatcher = watcher;
    } catch {
      // chokidar unavailable (tests) — feature is best-effort
    }
  }

  /** Enforce the per-scope session cap: evict idle (0-doc) sessions first,
   * then the one with the fewest open docs. */
  private evictForCap(scopeKey: string): void {
    const inScope = [...this.sessions.values()].filter(
      (m) => m.scopeKey === scopeKey && m.state !== "stopped",
    );
    if (inScope.length < MAX_SESSIONS_PER_SCOPE) return;
    const victim = inScope
      .slice()
      .sort(
        (a, b) =>
          (a.session?.openDocCount ?? 0) - (b.session?.openDocCount ?? 0),
      )[0];
    if (victim) this.dropSession(victim);
  }

  private maybeStartIdleTimer(managed: Managed): void {
    if ((managed.session?.openDocCount ?? 0) > 0) return;
    this.clearIdleTimer(managed);
    managed.idleTimer = setTimeout(() => {
      if ((managed.session?.openDocCount ?? 0) === 0) this.dropSession(managed);
    }, IDLE_SHUTDOWN_MS);
  }

  private clearIdleTimer(managed: Managed): void {
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer);
      managed.idleTimer = null;
    }
  }

  private trackSender(senderId: number, dk: string): void {
    let docs = this.senderDocs.get(senderId);
    if (!docs) {
      docs = new Set();
      this.senderDocs.set(senderId, docs);
    }
    docs.add(dk);
  }

  private errorReason(managed: Managed): DocOpenResult["reason"] {
    return managed.lastError?.startsWith("missing:") ? "missing" : "error";
  }

  private emitStatus(): void {
    this.broadcastStatus(this.statusList());
  }

  /** Marker probe on the remote host — null when no marker is present. */
  private async probeRootRemote(
    ws: WorkspaceEnv,
    path: string,
    markers: string[],
    rigRoot: string | null,
  ): Promise<string | null> {
    const { sshLspProbeRoot } = await import("./sshTransport");
    return sshLspProbeRoot(ws, path, markers, rigRoot);
  }

  private async findRootRemote(
    ws: WorkspaceEnv,
    path: string,
    markers: string[],
    rigRoot: string | null,
  ): Promise<string> {
    const { sshLspFindRoot } = await import("./sshTransport");
    return sshLspFindRoot(ws, path, markers, rigRoot);
  }
}

export class MissingServerError extends Error {
  constructor(command: string) {
    super(`missing: "${command}" not found (managed install or PATH)`);
  }
}

function docKey(scopeKey: string, path: string): string {
  return `${scopeKey}\u0000${path}`;
}

function shortError(e: unknown, stderr?: string): string {
  const base = e instanceof Error ? e.message : String(e);
  return `${base}${tailNote(stderr)}`;
}

function tailNote(stderr?: string): string {
  const tail = stderr?.trim().slice(-300);
  return tail ? ` — ${tail}` : "";
}

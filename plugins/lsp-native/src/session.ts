/**
 * One running language-server instance: the initialize handshake, the open-doc
 * table with incremental sync (main keeps its own copy of every open doc so it
 * can replay after a crash restart and validate checksums), request wrappers
 * with per-doc cancellation, and publishDiagnostics fan-out.
 */
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  CancellationTokenSource,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import type * as lsp from "vscode-languageserver-protocol";
import type { LspTransport } from "./transport";
import type { DocChange, LspServerConfig } from "./types";
import { contentChecksum } from "./types";
import { pathToUri, uriToPath } from "./uri";

const INIT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 15_000;

type OpenDoc = {
  uri: string;
  path: string;
  languageId: string;
  version: number;
  text: string;
  /** webContents ids holding this doc open (multi-window refcounting). */
  refs: Set<number>;
};

export type DiagnosticsSink = (
  path: string,
  version: number | undefined,
  diagnostics: lsp.Diagnostic[],
) => void;

/** Apply one LSP incremental content change to a text snapshot. */
export function applyContentChange(text: string, change: DocChange): string {
  if (!change.range) return change.text;
  const start = offsetAt(text, change.range.start.line, change.range.start.character);
  const end = offsetAt(text, change.range.end.line, change.range.end.character);
  return text.slice(0, start) + change.text + text.slice(end);
}

/** UTF-16 offset of {line, character} in text (clamped, LSP semantics). */
export function offsetAt(text: string, line: number, character: number): number {
  let offset = 0;
  let currentLine = 0;
  while (currentLine < line) {
    const nl = text.indexOf("\n", offset);
    if (nl === -1) return text.length;
    offset = nl + 1;
    currentLine++;
  }
  const lineEnd = text.indexOf("\n", offset);
  const limit = lineEnd === -1 ? text.length : lineEnd;
  return Math.min(offset + character, limit);
}

export class LspSession {
  private readonly connection: MessageConnection;
  private readonly docs = new Map<string, OpenDoc>();
  private initPromise: Promise<void> | null = null;
  private disposed = false;
  serverCapabilities: lsp.ServerCapabilities = {};
  /** Per-doc in-flight cancellation, keyed `<uri>:<kind>`. */
  private readonly inflight = new Map<string, CancellationTokenSource>();

  constructor(
    private readonly transport: LspTransport,
    private readonly config: LspServerConfig,
    private readonly root: string,
    private readonly onDiagnostics: DiagnosticsSink,
  ) {
    this.connection = createMessageConnection(
      new StreamMessageReader(transport.reader),
      new StreamMessageWriter(transport.writer),
    );
    this.connection.onNotification(
      "textDocument/publishDiagnostics",
      (p: lsp.PublishDiagnosticsParams) => {
        this.onDiagnostics(uriToPath(p.uri), p.version ?? undefined, p.diagnostics);
      },
    );
    // Servers ask for settings sections; answer from config.settings for each.
    this.connection.onRequest(
      "workspace/configuration",
      (p: { items: Array<{ section?: string }> }) =>
        p.items.map((item) => sectionOf(this.config.settings, item.section)),
    );
    this.connection.onRequest("client/registerCapability", () => null);
    this.connection.onRequest("client/unregisterCapability", () => null);
    this.connection.onRequest("window/workDoneProgress/create", () => null);
    this.connection.onRequest("workspace/applyEdit", () => ({ applied: false }));
    this.connection.onRequest("workspace/workspaceFolders", () => [
      { uri: pathToUri(this.root), name: this.root.split("/").pop() ?? this.root },
    ]);
    // Log/telemetry notifications are expected chatter — swallow them.
    this.connection.onNotification(() => {});
    this.connection.onError(() => {});
    this.connection.onClose(() => {});
    this.connection.listen();
  }

  get pid(): number | undefined {
    return this.transport.pid;
  }

  get openDocCount(): number {
    return this.docs.size;
  }

  /** Paths of currently open docs with the given renderer ref removed. */
  dropRefsOf(senderId: number): string[] {
    const closed: string[] = [];
    for (const [path, doc] of this.docs) {
      doc.refs.delete(senderId);
      if (doc.refs.size === 0) {
        this.docs.delete(path);
        this.notifyDidClose(doc);
        closed.push(path);
      }
    }
    return closed;
  }

  initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const rootUri = pathToUri(this.root);
    const params: lsp.InitializeParams = {
      processId: process.pid,
      rootUri,
      workspaceFolders: [
        { uri: rootUri, name: this.root.split("/").pop() ?? this.root },
      ],
      clientInfo: { name: "Termco", version: "1.0.0" },
      initializationOptions: this.config.initializationOptions,
      capabilities: {
        general: { positionEncodings: ["utf-16"] },
        textDocument: {
          synchronization: { didSave: true },
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: {},
          publishDiagnostics: { versionSupport: true },
          completion: {
            contextSupport: true,
            completionItem: {
              snippetSupport: true,
              documentationFormat: ["markdown", "plaintext"],
              resolveSupport: {
                properties: ["documentation", "detail", "additionalTextEdits"],
              },
            },
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: { labelOffsetSupport: true },
              activeParameterSupport: true,
            },
          },
          semanticTokens: {
            requests: { full: true },
            tokenTypes: [
              "namespace", "type", "class", "enum", "interface", "struct",
              "typeParameter", "parameter", "variable", "property",
              "enumMember", "event", "function", "method", "macro",
              "keyword", "modifier", "comment", "string", "number",
              "regexp", "operator", "decorator",
            ],
            tokenModifiers: [
              "declaration", "definition", "readonly", "static",
              "deprecated", "abstract", "async", "modification",
              "documentation", "defaultLibrary",
            ],
            formats: ["relative"],
            multilineTokenSupport: false,
            overlappingTokenSupport: false,
          },
        },
        workspace: {
          configuration: true,
          didChangeConfiguration: {},
          workspaceFolders: true,
        },
        window: {},
      },
    };
    const result = (await this.requestWithTimeout(
      "initialize",
      params,
      INIT_TIMEOUT_MS,
    )) as lsp.InitializeResult;
    this.serverCapabilities = result.capabilities ?? {};
    const encoding = this.serverCapabilities.positionEncoding;
    if (encoding && encoding !== "utf-16") {
      // We only speak utf-16; positions from such a server would be wrong.
      throw new Error(`server insists on unsupported position encoding "${encoding}"`);
    }
    this.notify("initialized", {});
    if (this.config.settings !== undefined) {
      this.notify("workspace/didChangeConfiguration", {
        settings: this.config.settings,
      });
    }
  }

  // ── document sync ────────────────────────────────────────────────────────

  openDoc(
    path: string,
    languageId: string,
    text: string,
    senderId: number,
  ): void {
    const existing = this.docs.get(path);
    if (existing) {
      existing.refs.add(senderId);
      return;
    }
    const doc: OpenDoc = {
      uri: pathToUri(path),
      path,
      languageId,
      version: 1,
      text,
      refs: new Set([senderId]),
    };
    this.docs.set(path, doc);
    this.notify("textDocument/didOpen", {
      textDocument: {
        uri: doc.uri,
        languageId,
        version: doc.version,
        text,
      },
    } satisfies lsp.DidOpenTextDocumentParams);
  }

  /** Returns `{resync: true}` when the checksum shows our copy drifted. */
  changeDoc(
    path: string,
    version: number,
    changes: DocChange[],
    checksum?: number,
  ): { resync?: true } {
    const doc = this.docs.get(path);
    if (!doc) return { resync: true };
    for (const change of changes) {
      doc.text = applyContentChange(doc.text, change);
    }
    doc.version = version;
    this.notify("textDocument/didChange", {
      textDocument: { uri: doc.uri, version },
      contentChanges: changes.map((c) =>
        c.range ? { range: c.range, text: c.text } : { text: c.text },
      ),
    } satisfies lsp.DidChangeTextDocumentParams);
    if (checksum !== undefined && contentChecksum(doc.text) !== checksum) {
      return { resync: true };
    }
    return {};
  }

  /** Full-text replace after a checksum mismatch. */
  resyncDoc(path: string, version: number, text: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    doc.text = text;
    doc.version = version;
    this.notify("textDocument/didChange", {
      textDocument: { uri: doc.uri, version },
      contentChanges: [{ text }],
    } satisfies lsp.DidChangeTextDocumentParams);
  }

  closeDoc(path: string, senderId: number): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    doc.refs.delete(senderId);
    if (doc.refs.size > 0) return;
    this.docs.delete(path);
    this.notifyDidClose(doc);
  }

  saveDoc(path: string): void {
    const doc = this.docs.get(path);
    if (!doc) return;
    this.notify("textDocument/didSave", {
      textDocument: { uri: doc.uri },
    } satisfies lsp.DidSaveTextDocumentParams);
  }

  /** Best-effort workspace/didChangeWatchedFiles (config/lockfile changes). */
  notifyWatchedFileChanged(path: string): void {
    this.notify("workspace/didChangeWatchedFiles", {
      changes: [{ uri: pathToUri(path), type: 2 }],
    } satisfies lsp.DidChangeWatchedFilesParams);
  }

  private notifyDidClose(doc: OpenDoc): void {
    this.notify("textDocument/didClose", {
      textDocument: { uri: doc.uri },
    } satisfies lsp.DidCloseTextDocumentParams);
  }

  /** Replay all open docs into a fresh server after a crash restart. */
  snapshotDocs(): Array<{
    path: string;
    languageId: string;
    text: string;
    refs: number[];
  }> {
    return [...this.docs.values()].map((d) => ({
      path: d.path,
      languageId: d.languageId,
      text: d.text,
      refs: [...d.refs],
    }));
  }

  docText(path: string): string | undefined {
    return this.docs.get(path)?.text;
  }

  hasDoc(path: string): boolean {
    return this.docs.has(path);
  }

  // ── feature requests ─────────────────────────────────────────────────────

  async hover(path: string, position: lsp.Position): Promise<lsp.Hover | null> {
    return this.docRequest(path, "hover", "textDocument/hover", { position });
  }

  async definition(
    path: string,
    position: lsp.Position,
  ): Promise<lsp.Definition | lsp.LocationLink[] | null> {
    return this.docRequest(path, "definition", "textDocument/definition", {
      position,
    });
  }

  async completion(
    path: string,
    position: lsp.Position,
    context?: lsp.CompletionContext,
  ): Promise<lsp.CompletionList | lsp.CompletionItem[] | null> {
    return this.docRequest(path, "completion", "textDocument/completion", {
      position,
      context,
    });
  }

  async resolveCompletion(item: lsp.CompletionItem): Promise<lsp.CompletionItem> {
    if (!this.serverCapabilities.completionProvider?.resolveProvider) {
      return item;
    }
    return (await this.requestWithTimeout(
      "completionItem/resolve",
      item,
      REQUEST_TIMEOUT_MS,
    )) as lsp.CompletionItem;
  }

  async signatureHelp(
    path: string,
    position: lsp.Position,
    context?: lsp.SignatureHelpContext,
  ): Promise<lsp.SignatureHelp | null> {
    return this.docRequest(path, "signature", "textDocument/signatureHelp", {
      position,
      context,
    });
  }

  /** The server's token legend — indexes in semantic-token data refer here. */
  get semanticTokensLegend(): lsp.SemanticTokensLegend | null {
    const provider = this.serverCapabilities.semanticTokensProvider;
    return provider ? provider.legend : null;
  }

  async semanticTokens(path: string): Promise<{ data: number[] } | null> {
    if (!this.serverCapabilities.semanticTokensProvider) return null;
    return this.docRequest(path, "semanticTokens", "textDocument/semanticTokens/full", {});
  }

  async formatting(
    path: string,
    options: lsp.FormattingOptions,
  ): Promise<lsp.TextEdit[] | null> {
    if (!this.serverCapabilities.documentFormattingProvider) return null;
    return this.docRequest(path, "formatting", "textDocument/formatting", {
      options,
    });
  }

  async pullDiagnostics(path: string): Promise<lsp.Diagnostic[] | null> {
    if (!this.serverCapabilities.diagnosticProvider) return null;
    const doc = this.docs.get(path);
    if (!doc) return null;
    const report = (await this.requestWithTimeout(
      "textDocument/diagnostic",
      { textDocument: { uri: doc.uri } },
      REQUEST_TIMEOUT_MS,
    )) as { kind?: string; items?: lsp.Diagnostic[] } | null;
    return report?.items ?? null;
  }

  /** A doc-scoped request that cancels any prior in-flight one of its kind. */
  private async docRequest<T>(
    path: string,
    kind: string,
    method: string,
    rest: Record<string, unknown>,
  ): Promise<T | null> {
    const doc = this.docs.get(path);
    if (!doc) return null;
    await this.initialize();
    const key = `${doc.uri}:${kind}`;
    this.inflight.get(key)?.cancel();
    const cts = new CancellationTokenSource();
    this.inflight.set(key, cts);
    try {
      return (await this.requestWithTimeout(
        method,
        { textDocument: { uri: doc.uri }, ...rest },
        REQUEST_TIMEOUT_MS,
        cts,
      )) as T;
    } catch (e) {
      if (isCancellation(e)) return null;
      throw e;
    } finally {
      if (this.inflight.get(key) === cts) this.inflight.delete(key);
    }
  }

  /** Fire-and-forget notification; write failures of a dying transport are
   * expected (crash/shutdown races) and must not become unhandled rejections. */
  private notify(method: string, params?: unknown): void {
    // sendNotification rejects asynchronously on write failures AND throws
    // synchronously on a disposed connection (e.g. a watcher event racing a
    // session teardown) — both are expected and must stay silent.
    try {
      void Promise.resolve(
        this.connection.sendNotification(method, params),
      ).catch(() => {});
    } catch {
      // connection already disposed
    }
  }

  private requestWithTimeout(
    method: string,
    params: unknown,
    timeoutMs: number,
    cts?: CancellationTokenSource,
  ): Promise<unknown> {
    const source = cts ?? new CancellationTokenSource();
    const timer = setTimeout(() => source.cancel(), timeoutMs);
    return this.connection
      .sendRequest(method, params, source.token)
      .finally(() => clearTimeout(timer));
  }

  onTransportExit(cb: (code: number | null) => void): void {
    this.transport.onExit(cb);
  }

  stderrTail(): string {
    return this.transport.stderrTail();
  }

  /** Graceful shutdown → exit → kill; used for idle/config-change teardown. */
  async shutdown(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try {
      await this.requestWithTimeout("shutdown", undefined, 3_000);
      this.notify("exit");
    } catch {
      // Unresponsive server — the kill below handles it.
    }
    setTimeout(() => this.transport.kill(), 3_000);
    this.connection.dispose();
  }

  /** Immediate teardown after a crash (transport already dead). */
  disposeAfterCrash(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.connection.dispose();
    this.transport.kill();
  }
}

function isCancellation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    // -32800 RequestCancelled, -32802 ServerCancelled
    ((e as { code: number }).code === -32800 ||
      (e as { code: number }).code === -32802)
  );
}

function sectionOf(settings: unknown, section?: string): unknown {
  if (!section || settings == null) return settings ?? null;
  let cursor: unknown = settings;
  for (const part of section.split(".")) {
    if (typeof cursor !== "object" || cursor === null) return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor ?? null;
}

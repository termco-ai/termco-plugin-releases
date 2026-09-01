/**
 * Remote MCP over HTTP. Two transports behind one class:
 *  - **Streamable HTTP** (spec 2025-03-26): POST each JSON-RPC message; the
 *    reply is either `application/json` (one response) or a `text/event-stream`
 *    the response arrives on. A server-issued `Mcp-Session-Id` is echoed back on
 *    every later request.
 *  - **Legacy HTTP+SSE** (spec 2024-11-05): open a long-lived SSE GET, learn the
 *    POST endpoint from the first `endpoint` event, then POST requests whose
 *    responses come back asynchronously over that stream (matched by id).
 * `mode: "auto"` tries Streamable HTTP, then falls back to SSE. Custom headers
 * (bearer / OAuth) ride on every request. `fetch` is injectable for tests.
 */
import { SseParser, type SseFrame } from "./sse";
import {
  CONNECT_TIMEOUT_MS,
  HTTP_PROTOCOL_VERSION,
  McpAuthError,
  type McpCallResult,
  type McpTool,
  type McpTransport,
  REQUEST_TIMEOUT_MS,
} from "./transport";

/**
 * Supplies + refreshes the bearer for a protected server. `currentToken` is the
 * cached access token (or undefined); `handleUnauthorized` is called once on a
 * 401 to refresh or run the interactive flow, returning a fresh token or null
 * when auth is impossible (user cancelled).
 */
export type AuthProvider = {
  currentToken(): string | undefined;
  handleUnauthorized(wwwAuth?: string): Promise<string | null>;
};

type HeadersLike = { get(name: string): string | null };
type ReaderLike = {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?(): Promise<void> | void;
};
type BodyLike = { getReader(): ReaderLike };
type ResponseLike = {
  ok: boolean;
  status: number;
  headers: HeadersLike;
  text(): Promise<string>;
  body: BodyLike | null;
};
type FetchInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};
export type FetchLike = (url: string, init: FetchInit) => Promise<ResponseLike>;

type HttpMode = "http" | "sse";
type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
};
type RpcMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

const CLIENT_INFO = { name: "Termco", version: "1.0.0" };
const defaultFetch: FetchLike = (u, init) => fetch(u, init);

export class McpHttpClient implements McpTransport {
  private mode: HttpMode = "http";
  private tools: McpTool[] = [];
  private sessionId: string | undefined;
  private nextId = 1;
  private connectedFlag = false;
  private readonly fetchImpl: FetchLike;
  // legacy-SSE state
  private sseAbort: AbortController | undefined;
  private postEndpoint = "";
  private readonly pending = new Map<number, Pending>();
  private endpointResolve: (() => void) | undefined;
  private endpointReject: ((e: Error) => void) | undefined;

  constructor(
    private readonly opts: {
      url: string;
      headers?: Record<string, string>;
      mode: HttpMode | "auto";
      fetchImpl?: FetchLike;
      auth?: AuthProvider;
    },
  ) {
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
  }

  /**
   * Fetch with the bearer attached (when an auth provider has one and no static
   * Authorization is already set). On 401, ask the provider to refresh/re-auth
   * once and retry; a definitive auth failure throws `McpAuthError` so the
   * transport-fallback loop rethrows instead of trying the next transport.
   */
  private async authorizedFetch(
    url: string,
    init: FetchInit,
  ): Promise<ResponseLike> {
    const token = this.opts.auth?.currentToken();
    const first =
      token && !("Authorization" in init.headers)
        ? { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }
        : init;
    let resp = await this.fetchImpl(url, first);
    if (resp.status !== 401 || !this.opts.auth) return resp;

    const fresh = await this.opts.auth.handleUnauthorized(
      resp.headers.get("www-authenticate") ?? undefined,
    );
    if (!fresh) throw new McpAuthError("MCP authorization failed");
    resp = await this.fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${fresh}` },
    });
    if (resp.status === 401) throw new McpAuthError("MCP authorization failed");
    return resp;
  }

  get connected(): boolean {
    return this.connectedFlag;
  }
  listTools(): McpTool[] {
    return this.tools;
  }

  async connect(): Promise<McpTool[]> {
    const order: HttpMode[] =
      this.opts.mode === "auto" ? ["http", "sse"] : [this.opts.mode];
    let lastErr: unknown;
    for (const m of order) {
      try {
        this.reset(m);
        await this.handshake();
        this.connectedFlag = true;
        return this.tools;
      } catch (e) {
        // A 401 is an auth problem, not a transport problem — don't fall through
        // to the next transport, surface it.
        if (e instanceof McpAuthError) throw e;
        lastErr = e;
        this.teardownStreams();
      }
    }
    throw new Error(`MCP HTTP connect failed: ${errMsg(lastErr)}`);
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    return (await this.request("tools/call", {
      name,
      arguments: args ?? {},
    })) as McpCallResult;
  }

  disconnect(): void {
    this.connectedFlag = false;
    this.teardownStreams();
    this.failAllPending(new Error("MCP disconnected"));
  }

  // ── handshake ────────────────────────────────────────────────────────────
  private async handshake(): Promise<void> {
    if (this.mode === "sse") await this.openSseStream();
    await this.request(
      "initialize",
      {
        protocolVersion: HTTP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
      CONNECT_TIMEOUT_MS,
    );
    this.notify("notifications/initialized");
    const res = (await this.request("tools/list", {})) as {
      tools?: McpTool[];
    };
    this.tools = res?.tools ?? [];
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    return this.mode === "http"
      ? this.streamableRequest(method, params, timeoutMs)
      : this.sseRequest(method, params, timeoutMs);
  }
  private notify(method: string, params: unknown = {}): void {
    if (this.mode === "http") void this.streamableNotify(method, params);
    else void this.postMessage({ jsonrpc: "2.0", method, params });
  }

  // ── streamable HTTP ──────────────────────────────────────────────────────
  private async streamableRequest(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = this.nextId++;
    const resp = await this.withTimeout(
      this.authorizedFetch(this.opts.url, {
        method: "POST",
        headers: this.httpHeaders(),
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      }),
      timeoutMs,
      method,
    );
    const sid = resp.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const ct = resp.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream") && resp.body) {
      return await this.withTimeout(readSseForId(resp.body, id), timeoutMs, method);
    }
    const text = await resp.text();
    if (!text.trim()) throw new Error(`empty response for "${method}"`);
    return unwrap(JSON.parse(text), id);
  }
  private async streamableNotify(method: string, params: unknown): Promise<void> {
    await this.authorizedFetch(this.opts.url, {
      method: "POST",
      headers: this.httpHeaders(),
      body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    }).catch(() => {});
  }

  // ── legacy HTTP+SSE ──────────────────────────────────────────────────────
  private async openSseStream(): Promise<void> {
    this.sseAbort = new AbortController();
    const resp = await this.authorizedFetch(this.opts.url, {
      method: "GET",
      headers: { Accept: "text/event-stream", ...(this.opts.headers ?? {}) },
      signal: this.sseAbort.signal,
    });
    if (!resp.ok || !resp.body) throw new Error(`SSE HTTP ${resp.status}`);
    const endpointReady = new Promise<void>((resolve, reject) => {
      this.endpointResolve = resolve;
      this.endpointReject = reject;
    });
    void this.pumpSse(resp.body);
    await this.withTimeout(endpointReady, CONNECT_TIMEOUT_MS, "sse endpoint");
  }
  private async pumpSse(body: BodyLike): Promise<void> {
    const parser = new SseParser();
    try {
      for await (const chunk of streamChunks(body)) {
        for (const frame of parser.push(chunk)) this.onSseFrame(frame);
      }
    } catch {
      // aborted or network drop — fall through to teardown
    }
    this.endpointReject?.(new Error("SSE closed before endpoint"));
    this.endpointReject = undefined;
    this.endpointResolve = undefined;
    this.connectedFlag = false;
    this.failAllPending(new Error("SSE stream closed"));
  }
  private onSseFrame(frame: SseFrame): void {
    if (frame.event === "endpoint") {
      this.postEndpoint = resolveUrl(this.opts.url, frame.data.trim());
      const r = this.endpointResolve;
      this.endpointResolve = undefined;
      this.endpointReject = undefined;
      r?.();
      return;
    }
    let msg: RpcMessage;
    try {
      msg = JSON.parse(frame.data);
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message ?? "MCP error"));
    else p.resolve(msg.result);
  }
  private sseRequest(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.postMessage({ jsonrpc: "2.0", id, method, params }).catch((e) => {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }
  private async postMessage(body: unknown): Promise<void> {
    if (!this.postEndpoint) throw new Error("MCP SSE endpoint not ready");
    const resp = await this.authorizedFetch(this.postEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.opts.headers ?? {}) },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  }

  // ── shared ───────────────────────────────────────────────────────────────
  private reset(mode: HttpMode): void {
    this.mode = mode;
    this.sessionId = undefined;
    this.tools = [];
    this.nextId = 1;
  }
  private teardownStreams(): void {
    this.sseAbort?.abort();
    this.sseAbort = undefined;
    this.postEndpoint = "";
  }
  private failAllPending(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
  private httpHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": HTTP_PROTOCOL_VERSION,
      ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
      ...(this.opts.headers ?? {}),
    };
  }
  private withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error(`MCP "${label}" timed out`)),
        ms,
      );
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }
}

async function* streamChunks(body: BodyLike): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield dec.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel?.();
  }
}

/** Read a per-request SSE stream until the JSON-RPC response for `id` arrives. */
async function readSseForId(body: BodyLike, id: number): Promise<unknown> {
  const parser = new SseParser();
  for await (const chunk of streamChunks(body)) {
    for (const frame of parser.push(chunk)) {
      let msg: unknown;
      try {
        msg = JSON.parse(frame.data);
      } catch {
        continue;
      }
      const found = matchId(msg, id);
      if (found !== NOT_FOUND) return found;
    }
  }
  throw new Error("SSE stream ended without a response");
}

const NOT_FOUND = Symbol("not-found");

/** Find the response for `id` in a message (or JSON-RPC batch); throw on error. */
function matchId(msg: unknown, id: number): unknown {
  const arr = Array.isArray(msg) ? msg : [msg];
  for (const m of arr as RpcMessage[]) {
    if (m && m.id === id) {
      if (m.error) throw new Error(m.error.message ?? "MCP error");
      return m.result ?? null;
    }
  }
  return NOT_FOUND;
}

function unwrap(msg: unknown, id: number): unknown {
  const found = matchId(msg, id);
  if (found === NOT_FOUND) throw new Error("no matching JSON-RPC response id");
  return found;
}

function resolveUrl(base: string, endpoint: string): string {
  try {
    return new URL(endpoint, base).toString();
  } catch {
    return endpoint;
  }
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

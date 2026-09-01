/**
 * The MCP server's HTTP transport (loopback only). Thin: it parses the request,
 * enforces the loopback/Host + bearer guards, then hands a JSON-RPC message to
 * the pure `protocol` handler and writes its response. All product logic lives
 * in `protocol.ts` / `tokens.ts`, which are tested without a socket.
 *
 * Security posture:
 *  - binds 127.0.0.1 only;
 *  - rejects any request whose Host header is not loopback (DNS-rebinding);
 *  - requires a Bearer token on every request (no token → 401);
 *  - wraps the whole handler so a malformed body can never crash main.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Protocol } from "./protocol";
import type { TokenStore } from "./tokens";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type HttpServerDeps = {
  tokens: TokenStore;
  protocol: Protocol;
  /** Called with the actually-bound port once listening (0 in tests → real). */
  onListening?: (port: number) => void;
  /** Structured error log (never throws). */
  onError?: (where: string, err: unknown) => void;
};

export function createMcpHttpServer(deps: HttpServerDeps) {
  let server: Server | null = null;
  let boundPort = 0;

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err) => {
      deps.onError?.("handler", err);
      safeJson(res, 500, { error: "internal error" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // DNS-rebinding guard: Host must be loopback on the bound port.
    if (!isLoopbackHost(req.headers.host, boundPort)) {
      return void safeJson(res, 403, { error: "forbidden host" });
    }

    const path = (req.url ?? "").split("?")[0];
    if (path !== "/mcp") {
      return void safeJson(res, 404, { error: "not found" });
    }

    const bearer = parseBearer(req.headers.authorization);
    const identity = deps.tokens.authenticate(bearer);
    if (!identity) {
      return void safeJson(res, 401, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: "unauthorized" },
      });
    }

    const sessionId = header(req.headers["mcp-session-id"]);

    if (req.method === "GET") {
      // No server-initiated stream on this tool-only server.
      return void safeJson(res, 405, { error: "method not allowed" });
    }
    if (req.method === "DELETE") {
      if (sessionId) deps.protocol.endSession(sessionId);
      return void safeJson(res, 200, { ok: true });
    }
    if (req.method !== "POST") {
      return void safeJson(res, 405, { error: "method not allowed" });
    }

    let raw: string;
    try {
      raw = await readBody(req);
    } catch (err) {
      deps.onError?.("read-body", err);
      return void safeJson(res, 413, { error: "body too large" });
    }

    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return void safeJson(res, 200, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "parse error" },
      });
    }
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) {
      // Batched requests are not supported by this server.
      return void safeJson(res, 200, {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "invalid request" },
      });
    }

    const response = await deps.protocol.handleRequest(identity, sessionId, msg);
    if (response.sessionId) res.setHeader("Mcp-Session-Id", response.sessionId);
    if (response.body === null) {
      res.writeHead(response.status).end();
      return;
    }
    safeJson(res, response.status, response.body);
  }

  return {
    /** Start listening on 127.0.0.1:<port> (0 = ephemeral, for tests). */
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        server = httpServer;
        httpServer.once("error", reject);
        httpServer.listen(port, "127.0.0.1", () => {
          httpServer.removeListener("error", reject);
          const addr = httpServer.address();
          boundPort = typeof addr === "object" && addr ? addr.port : port;
          deps.onListening?.(boundPort);
          resolve(boundPort);
        });
      });
    },
    port(): number {
      return boundPort;
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.close(() => resolve());
        server = null;
      });
    },
  };
}

export type McpHttpServer = ReturnType<typeof createMcpHttpServer>;

/** Read a bounded request body as a utf8 string, rejecting oversize. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function parseBearer(auth: string | undefined): string | undefined {
  if (!auth) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : undefined;
}

function header(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Accept only 127.0.0.1 / localhost / [::1] on the bound port (or no port). */
export function isLoopbackHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  let name: string;
  let p: string | undefined;
  if (host.startsWith("[")) {
    // Bracketed IPv6: [::1] or [::1]:port
    const end = host.indexOf("]");
    if (end === -1) return false;
    name = host.slice(1, end);
    p = host.slice(end + 1).replace(/^:/, "") || undefined;
  } else {
    const idx = host.indexOf(":");
    name = idx === -1 ? host : host.slice(0, idx);
    p = idx === -1 ? undefined : host.slice(idx + 1);
  }
  if (p && port && Number(p) !== port) return false;
  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

function safeJson(res: ServerResponse, status: number, body: unknown): void {
  try {
    const text = JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json" }).end(text);
  } catch {
    try {
      res.writeHead(500).end();
    } catch {
      /* socket already gone */
    }
  }
}
// Owned by the mcp-server-native provider plugin.

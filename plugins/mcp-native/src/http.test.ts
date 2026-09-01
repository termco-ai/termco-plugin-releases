import { describe, expect, it, vi } from "vitest";
import { type FetchLike, McpHttpClient } from "./http";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

function headers(map: Record<string, string>) {
  return { get: (k: string) => map[k.toLowerCase()] ?? null };
}

function jsonResp(obj: unknown, extra: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    headers: headers({ "content-type": "application/json", ...extra }),
    text: async () => JSON.stringify(obj),
    body: null,
  };
}

function sseResp(frames: string[]) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    headers: headers({ "content-type": "text/event-stream" }),
    text: async () => "",
    body: {
      getReader: () => ({
        read: async () =>
          i < frames.length
            ? { done: false, value: bytes(frames[i++]) }
            : { done: true },
        cancel: () => {},
      }),
    },
  };
}

const rpc = (id: number, result: unknown) =>
  JSON.stringify({ jsonrpc: "2.0", id, result });

const parseBody = (init: { body?: string }) =>
  JSON.parse(init.body ?? "{}") as { id?: number; method: string };

/** A pushable stream for driving a long-lived legacy-SSE connection. */
class Pushable {
  private queue: string[] = [];
  private waiters: ((v: { done: boolean; value?: Uint8Array }) => void)[] = [];
  private done = false;
  push(s: string) {
    const w = this.waiters.shift();
    if (w) w({ done: false, value: bytes(s) });
    else this.queue.push(s);
  }
  reader() {
    return {
      read: () =>
        new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
          const s = this.queue.shift();
          if (s !== undefined) resolve({ done: false, value: bytes(s) });
          else if (this.done) resolve({ done: true });
          else this.waiters.push(resolve);
        }),
      cancel: () => {
        this.done = true;
      },
    };
  }
}

describe("McpHttpClient — Streamable HTTP", () => {
  const streamableFetch =
    (opts: { toolsViaSse?: boolean } = {}): FetchLike =>
    async (_url, init) => {
      const m = parseBody(init);
      if (m.method === "initialize")
        return jsonResp(
          { jsonrpc: "2.0", id: m.id, result: { capabilities: {} } },
          { "mcp-session-id": "sess-1" },
        );
      if (m.method === "notifications/initialized") return jsonResp("");
      if (m.method === "tools/list") {
        const payload = { tools: [{ name: "t", inputSchema: {} }] };
        return opts.toolsViaSse
          ? sseResp([`event: message\ndata: ${rpc(m.id ?? 0, payload)}\n\n`])
          : jsonResp({ jsonrpc: "2.0", id: m.id, result: payload });
      }
      if (m.method === "tools/call")
        return jsonResp({
          jsonrpc: "2.0",
          id: m.id,
          result: { content: [{ type: "text", text: "ok" }] },
        });
      return jsonResp("");
    };

  it("handshakes over JSON and lists tools", async () => {
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "http",
      fetchImpl: streamableFetch(),
    });
    expect(await c.connect()).toEqual([{ name: "t", inputSchema: {} }]);
    expect(c.connected).toBe(true);
    const res = await c.callTool("t", {});
    expect(res).toMatchObject({ content: [{ type: "text", text: "ok" }] });
  });

  it("reads a response delivered as an SSE stream", async () => {
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "http",
      fetchImpl: streamableFetch({ toolsViaSse: true }),
    });
    expect(await c.connect()).toEqual([{ name: "t", inputSchema: {} }]);
  });

  it("sends the session id back on later requests", async () => {
    const seen: Record<string, string | null>[] = [];
    const base = streamableFetch();
    const spy: FetchLike = async (u, init) => {
      seen.push({ sid: init.headers["Mcp-Session-Id"] ?? null });
      return base(u, init);
    };
    const c = new McpHttpClient({ url: "https://x/mcp", mode: "http", fetchImpl: spy });
    await c.connect();
    // initialize has no session yet; tools/list (3rd call) carries it.
    expect(seen.some((h) => h.sid === "sess-1")).toBe(true);
  });

  it("rejects connect on a non-OK initialize", async () => {
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "http",
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        headers: headers({}),
        text: async () => "",
        body: null,
      }),
    });
    await expect(c.connect()).rejects.toThrow(/401/);
  });
});

describe("McpHttpClient — legacy HTTP+SSE", () => {
  const legacyFetch = (stream: Pushable): FetchLike => {
    return async (_url, init) => {
      if (init.method === "GET") {
        queueMicrotask(() =>
          stream.push("event: endpoint\ndata: /messages\n\n"),
        );
        return {
          ok: true,
          status: 200,
          headers: headers({ "content-type": "text/event-stream" }),
          text: async () => "",
          body: { getReader: () => stream.reader() },
        };
      }
      const m = parseBody(init);
      if (m.id != null) {
        const result =
          m.method === "initialize"
            ? { capabilities: {} }
            : m.method === "tools/list"
              ? { tools: [{ name: "t", inputSchema: {} }] }
              : { content: [{ type: "text", text: "ok" }] };
        queueMicrotask(() =>
          stream.push(`event: message\ndata: ${rpc(m.id ?? 0, result)}\n\n`),
        );
      }
      return {
        ok: true,
        status: 202,
        headers: headers({}),
        text: async () => "",
        body: null,
      };
    };
  };

  it("learns the endpoint, handshakes, and calls a tool", async () => {
    const c = new McpHttpClient({
      url: "https://x/sse",
      mode: "sse",
      fetchImpl: legacyFetch(new Pushable()),
    });
    expect(await c.connect()).toEqual([{ name: "t", inputSchema: {} }]);
    const res = await c.callTool("t", {});
    expect(res).toMatchObject({ content: [{ type: "text", text: "ok" }] });
  });
});

describe("McpHttpClient — OAuth", () => {
  const wwwAuth = { "www-authenticate": 'Bearer realm="x"' };

  it("re-auths on 401 and retries the request", async () => {
    const fetchImpl: FetchLike = async (_url, init) => {
      const m = parseBody(init);
      const authed = !!init.headers.Authorization;
      if (m.method === "initialize" && !authed)
        return {
          ok: false,
          status: 401,
          headers: headers(wwwAuth),
          text: async () => "",
          body: null,
        };
      if (m.method === "initialize")
        return jsonResp({ jsonrpc: "2.0", id: m.id, result: { capabilities: {} } });
      if (m.method === "tools/list")
        return jsonResp({
          jsonrpc: "2.0",
          id: m.id,
          result: { tools: [{ name: "t", inputSchema: {} }] },
        });
      return jsonResp("");
    };
    const handleUnauthorized = vi.fn(async () => "tok");
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "http",
      fetchImpl,
      auth: { currentToken: () => undefined, handleUnauthorized },
    });
    expect(await c.connect()).toEqual([{ name: "t", inputSchema: {} }]);
    expect(handleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("throws (no transport fallthrough) when auth is refused", async () => {
    let sseAttempted = false;
    const fetchImpl: FetchLike = async (_url, init) => {
      if (init.method === "GET") {
        sseAttempted = true;
        return {
          ok: true,
          status: 200,
          headers: headers({ "content-type": "text/event-stream" }),
          text: async () => "",
          body: { getReader: () => ({ read: async () => ({ done: true }) }) },
        };
      }
      return {
        ok: false,
        status: 401,
        headers: headers(wwwAuth),
        text: async () => "",
        body: null,
      };
    };
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "auto",
      fetchImpl,
      auth: { currentToken: () => undefined, handleUnauthorized: async () => null },
    });
    await expect(c.connect()).rejects.toThrow(/authorization/i);
    expect(sseAttempted).toBe(false);
  });
});

describe("McpHttpClient — auto fallback", () => {
  it("falls back to SSE when Streamable HTTP fails", async () => {
    const stream = new Pushable();
    const fetchImpl: FetchLike = async (url, init) => {
      // Streamable attempt: POST straight to the base URL → reject.
      if (init.method === "POST" && url.endsWith("/mcp")) {
        return {
          ok: false,
          status: 405,
          headers: headers({}),
          text: async () => "",
          body: null,
        };
      }
      if (init.method === "GET") {
        queueMicrotask(() =>
          stream.push("event: endpoint\ndata: /messages\n\n"),
        );
        return {
          ok: true,
          status: 200,
          headers: headers({ "content-type": "text/event-stream" }),
          text: async () => "",
          body: { getReader: () => stream.reader() },
        };
      }
      const m = parseBody(init);
      if (m.id != null) {
        const result =
          m.method === "tools/list"
            ? { tools: [{ name: "t", inputSchema: {} }] }
            : { capabilities: {} };
        queueMicrotask(() =>
          stream.push(`event: message\ndata: ${rpc(m.id ?? 0, result)}\n\n`),
        );
      }
      return {
        ok: true,
        status: 202,
        headers: headers({}),
        text: async () => "",
        body: null,
      };
    };
    const c = new McpHttpClient({
      url: "https://x/mcp",
      mode: "auto",
      fetchImpl,
    });
    expect(await c.connect()).toEqual([{ name: "t", inputSchema: {} }]);
  });
});

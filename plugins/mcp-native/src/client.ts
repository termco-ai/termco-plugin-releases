/**
 * Minimal MCP client over stdio (JSON-RPC 2.0, newline-delimited — the MCP
 * stdio transport). Spawns the server subprocess, does the initialize handshake,
 * lists tools, and forwards tool calls. Defensive: per-request timeouts, all
 * pending requests reject on server exit, output framing tolerates partial
 * chunks. HTTP/SSE transports are a separate follow-up.
 */
import { type ChildProcess, spawn } from "node:child_process";
import {
  CONNECT_TIMEOUT_MS,
  type McpCallResult,
  type McpTool,
  REQUEST_TIMEOUT_MS,
  STDIO_PROTOCOL_VERSION as PROTOCOL_VERSION,
} from "./transport";

export type { McpCallResult, McpTool } from "./transport";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

/** The subset of ChildProcess we drive — a real ChildProcess satisfies it, and
 * tests can supply a lightweight stand-in without a subprocess. */
type ChildLike = {
  stdin: { write(data: string): unknown } | null;
  kill(): void;
};

export class McpStdioClient {
  private child: ChildLike | null = null;
  private buffer = "";
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private tools: McpTool[] = [];
  private lastError = "";

  /** Spawn + handshake + list tools. Rejects (and cleans up) on failure. */
  async connect(
    command: string,
    args: string[],
    env?: Record<string, string>,
  ): Promise<McpTool[]> {
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(env ?? {}) },
      });
    } catch (e) {
      throw new Error(`failed to spawn "${command}": ${String(e)}`);
    }
    this.child = child;
    child.stdout?.on("data", (c: Buffer) => this.onData(c));
    child.stderr?.on("data", (c: Buffer) => {
      this.lastError = c.toString("utf8").slice(-500);
    });
    child.on("exit", () => this.onExit());
    child.on("error", (e) => {
      this.lastError = String(e);
      this.onExit();
    });

    try {
      await this.request(
        "initialize",
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "Termco", version: "1.0.0" },
        },
        CONNECT_TIMEOUT_MS,
      );
      this.notify("notifications/initialized", {});
      const res = (await this.request("tools/list", {})) as {
        tools?: McpTool[];
      };
      this.tools = res?.tools ?? [];
      return this.tools;
    } catch (e) {
      this.disconnect();
      throw new Error(
        `MCP handshake failed: ${String(e)}${this.lastError ? ` — ${this.lastError}` : ""}`,
      );
    }
  }

  listTools(): McpTool[] {
    return this.tools;
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    const res = (await this.request("tools/call", {
      name,
      arguments: args ?? {},
    })) as McpCallResult;
    return res;
  }

  get connected(): boolean {
    return this.child != null;
  }

  disconnect(): void {
    const child = this.child;
    this.child = null;
    child?.kill();
    this.onExit();
  }

  // ── internals ──────────────────────────────────────────────────────────

  /** Feed a chunk of stdout; dispatch every complete newline-framed message. */
  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let nl = this.buffer.indexOf("\n");
    while (nl !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (line) this.ingest(line);
      nl = this.buffer.indexOf("\n");
    }
  }

  /** Parse one JSON-RPC line and resolve/reject its pending request. */
  private ingest(line: string): void {
    let msg: {
      id?: number;
      result?: unknown;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON (some servers log to stdout)
    }
    if (typeof msg.id !== "number") return; // a notification — ignore
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error.message ?? "MCP error"));
    else p.resolve(msg.result);
  }

  private onExit(): void {
    if (this.child) this.child = null;
    if (this.pending.size === 0) return;
    const err = new Error("MCP server disconnected");
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private write(obj: unknown): void {
    this.child?.stdin?.write(`${JSON.stringify(obj)}\n`);
  }

  private notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    if (!this.child) return Promise.reject(new Error("MCP not connected"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request "${method}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Test seam: feed raw stdout bytes without a real subprocess. */
  _ingestForTest(text: string): void {
    this.onData(Buffer.from(text, "utf8"));
  }
  /** Test seam: register a stand-in child so request()/write() proceed. */
  _setChildForTest(child: ChildLike): void {
    this.child = child;
  }
}

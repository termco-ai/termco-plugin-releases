import { describe, expect, it, vi } from "vitest";
import { McpStdioClient } from "./client";

/** A stand-in child that captures newline-framed JSON written to stdin. */
function fakeChild() {
  const writes: string[] = [];
  return {
    writes,
    stdin: { write: (s: string) => writes.push(s) },
    kill: vi.fn(),
  };
}

/** Parse the id of the Nth request the client wrote. */
function requestId(writes: string[], n = 0): number {
  const reqs = writes
    .map((w) => JSON.parse(w))
    .filter((m) => typeof m.id === "number");
  return reqs[n].id;
}

describe("McpStdioClient framing", () => {
  it("resolves a request when its response line arrives", async () => {
    const client = new McpStdioClient();
    const child = fakeChild();
    client._setChildForTest(child);

    const p = client.callTool("greet", { who: "world" });
    const id = requestId(child.writes);
    // request went out as one newline-terminated JSON line
    expect(child.writes[0].endsWith("\n")).toBe(true);
    expect(JSON.parse(child.writes[0])).toMatchObject({
      method: "tools/call",
      params: { name: "greet", arguments: { who: "world" } },
    });

    client._ingestForTest(
      `${JSON.stringify({ jsonrpc: "2.0", id, result: { content: "hi" } })}\n`,
    );
    await expect(p).resolves.toEqual({ content: "hi" });
  });

  it("reassembles a response split across chunks", async () => {
    const client = new McpStdioClient();
    const child = fakeChild();
    client._setChildForTest(child);

    const p = client.callTool("x", {});
    const id = requestId(child.writes);
    const line = JSON.stringify({ jsonrpc: "2.0", id, result: { ok: 1 } });
    client._ingestForTest(line.slice(0, 10));
    client._ingestForTest(`${line.slice(10)}\n`);
    await expect(p).resolves.toEqual({ ok: 1 });
  });

  it("ignores non-JSON stdout noise", async () => {
    const client = new McpStdioClient();
    const child = fakeChild();
    client._setChildForTest(child);

    const p = client.callTool("x", {});
    const id = requestId(child.writes);
    client._ingestForTest("starting server...\n");
    client._ingestForTest(
      `${JSON.stringify({ jsonrpc: "2.0", id, result: { ok: true } })}\n`,
    );
    await expect(p).resolves.toEqual({ ok: true });
  });

  it("rejects a request with a JSON-RPC error", async () => {
    const client = new McpStdioClient();
    const child = fakeChild();
    client._setChildForTest(child);

    const p = client.callTool("boom", {});
    const id = requestId(child.writes);
    client._ingestForTest(
      `${JSON.stringify({ jsonrpc: "2.0", id, error: { message: "nope" } })}\n`,
    );
    await expect(p).rejects.toThrow("nope");
  });

  it("rejects all pending requests on disconnect", async () => {
    const client = new McpStdioClient();
    client._setChildForTest(fakeChild());
    const p = client.callTool("x", {});
    client.disconnect();
    await expect(p).rejects.toThrow(/disconnected/);
    expect(client.connected).toBe(false);
  });

  it("rejects when not connected", async () => {
    const client = new McpStdioClient();
    await expect(client.callTool("x", {})).rejects.toThrow(/not connected/);
  });
});

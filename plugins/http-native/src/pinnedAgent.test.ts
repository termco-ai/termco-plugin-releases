/**
 * Connect-fallback behavior of the pinned dispatcher.
 *
 * Regression guard: `localhost` resolves to `[::1, 127.0.0.1]` on macOS, so
 * pinning to the *first* safe IP made every request to an IPv4-only local model
 * server (9router, LM Studio, Ollama, …) fail with ECONNREFUSED — while curl and
 * plain fetch worked, because they fall back across address families.
 */
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { request } from "undici";
import { pinnedAgent } from "./index";

let server: Server | undefined;

/** Start an HTTP server bound to IPv4 loopback only; resolve its port. */
async function startIpv4OnlyServer(): Promise<number> {
  const srv = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  server = srv;
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return addr.port;
}

afterEach(async () => {
  if (server) await new Promise((r) => server?.close(r));
  server = undefined;
});

describe("pinnedAgent", () => {
  it("falls_back_to_ipv4_when_ipv6_is_pinned_first", async () => {
    const port = await startIpv4OnlyServer();
    const agent = pinnedAgent(["::1", "127.0.0.1"]);
    try {
      const res = await request(`http://localhost:${port}/`, {
        method: "GET",
        dispatcher: agent,
      });
      expect(res.statusCode).toBe(200);
      expect(await res.body.text()).toBe("ok");
    } finally {
      await agent.close();
    }
  });

  it("connects_when_the_reachable_ip_comes_first", async () => {
    const port = await startIpv4OnlyServer();
    const agent = pinnedAgent(["127.0.0.1", "::1"]);
    try {
      const res = await request(`http://localhost:${port}/`, {
        method: "GET",
        dispatcher: agent,
      });
      expect(res.statusCode).toBe(200);
      expect(await res.body.text()).toBe("ok");
    } finally {
      await agent.close();
    }
  });

  it("still_fails_when_no_pinned_ip_listens", async () => {
    // Port 1 is never bound — proves the fallback does not silently widen the
    // pin to some other address the classifier never approved.
    const agent = pinnedAgent(["::1", "127.0.0.1"]);
    try {
      await expect(
        request("http://localhost:1/", { method: "GET", dispatcher: agent }),
      ).rejects.toThrow();
    } finally {
      await agent.close();
    }
  });
});

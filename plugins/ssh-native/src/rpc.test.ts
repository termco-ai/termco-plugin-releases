import { describe, expect, it } from "vitest";
import { encodeMessage, type RpcMessage } from "./protocol";
import { RpcClient } from "./rpc";

function harness() {
  const frames: RpcMessage[] = [];
  const client = new RpcClient((f) => frames.push(JSON.parse(f) as RpcMessage));
  const lastReq = () => {
    const m = frames[frames.length - 1];
    if (m.t !== "req") throw new Error("last frame not a request");
    return m;
  };
  return { client, lastReq };
}

describe("RpcClient", () => {
  it("correlates a response to its request by id", async () => {
    const { client, lastReq } = harness();
    const p = client.call("sys.ping", { a: 1 });
    const req = lastReq();
    expect(req).toMatchObject({ t: "req", method: "sys.ping", params: { a: 1 } });
    client.feed(encodeMessage({ t: "res", id: req.id, ok: true, result: { version: "x" } }));
    expect(await p).toEqual({ version: "x" });
  });

  it("rejects when the server returns an error", async () => {
    const { client, lastReq } = harness();
    const p = client.call("boom");
    client.feed(encodeMessage({ t: "res", id: lastReq().id, ok: false, error: "nope" }));
    await expect(p).rejects.toThrow("nope");
  });

  it("routes evt frames to the matching channel handler", () => {
    const { client } = harness();
    const events: Array<[string, unknown]> = [];
    const ch = client.openChannel((event, data) => events.push([event, data]));
    client.feed(encodeMessage({ t: "evt", channel: ch, event: "data", data: "hi" }));
    client.feed(encodeMessage({ t: "evt", channel: ch + 99, event: "data", data: "ignored" }));
    expect(events).toEqual([["data", "hi"]]);
  });

  it("handles two frames in one chunk and rejectAll closes further calls", async () => {
    const { client, lastReq } = harness();
    const p1 = client.call("a");
    const id1 = lastReq().id;
    const p2 = client.call("b");
    const id2 = lastReq().id;
    client.feed(
      encodeMessage({ t: "res", id: id1, ok: true, result: 1 }) +
        encodeMessage({ t: "res", id: id2, ok: true, result: 2 }),
    );
    expect(await Promise.all([p1, p2])).toEqual([1, 2]);
    client.rejectAll(new Error("transport died"));
    await expect(client.call("after")).rejects.toThrow("closed");
  });
});

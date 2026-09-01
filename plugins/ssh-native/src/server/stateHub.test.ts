// Behavior test owned by the ssh-native remote daemon.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createStateHub, type DomainSpec } from "./stateHub";

type Emitted = { channel: number; event: string; data: unknown };

function harness(opts: {
  domains: DomainSpec[];
  cacheFile?: string | null;
}) {
  const emitted: Emitted[] = [];
  const hub = createStateHub({
    domains: opts.domains,
    emit: (channel, event, data) => emitted.push({ channel, event, data }),
    cacheFile: opts.cacheFile ?? null,
    persistDebounceMs: 10,
  });
  return { hub, emitted };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("stateHub", () => {
  it("pushes only when a domain's data actually changes", async () => {
    let value = "a";
    const h = harness({
      domains: [
        { name: "ports", intervalMs: 15, collect: async () => value },
      ],
    });
    await h.hub.subscribe(1);
    await sleep(40); // several collect ticks with identical data
    const pushes = h.emitted.filter((e) => e.event === "state");
    expect(pushes.length).toBe(1);

    value = "b";
    await sleep(40);
    const after = h.emitted.filter((e) => e.event === "state");
    expect(after.length).toBe(2);
    expect((after[1].data as { data: unknown }).data).toBe("b");
    h.hub.unsubscribe(1);
  });

  it("isolates collector failures inside the domain snapshot", async () => {
    const h = harness({
      domains: [
        {
          name: "containers",
          intervalMs: 15,
          collect: async () => {
            throw new Error("docker missing");
          },
        },
        { name: "ports", intervalMs: 15, collect: async () => [80] },
      ],
    });
    await h.hub.subscribe(1);
    await sleep(30);
    const byDomain = new Map(
      h.emitted
        .filter((e) => e.event === "state")
        .map((e) => [
          (e.data as { domain: string }).domain,
          e.data as { error: string | null; data: unknown },
        ]),
    );
    expect(byDomain.get("containers")?.error).toContain("docker missing");
    expect(byDomain.get("ports")?.error).toBeNull();
    expect(byDomain.get("ports")?.data).toEqual([80]);
    h.hub.unsubscribe(1);
  });

  it("persists fresh snapshots and serves them stale after a restart", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "termco-hub-")), "cache.json");
    const a = harness({
      domains: [{ name: "ports", intervalMs: 15, collect: async () => [3000] }],
      cacheFile: file,
    });
    await a.hub.subscribe(1);
    await sleep(30);
    await a.hub.persistNow();
    a.hub.unsubscribe(1);

    // "Restart": a fresh hub over the same cache file, with a collector that
    // hasn't produced anything yet.
    const b = harness({
      domains: [
        {
          name: "ports",
          intervalMs: 5_000,
          collect: () => new Promise(() => {}), // never resolves
        },
      ],
      cacheFile: file,
    });
    await b.hub.subscribe(7);
    const first = b.emitted.find((e) => e.event === "state");
    expect(first?.channel).toBe(7);
    expect(first?.data).toMatchObject({
      domain: "ports",
      data: [3000],
      stale: true,
    });
    b.hub.unsubscribe(7);
  });

  it("re-pushes after staleness even when data is unchanged", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "termco-hub-")), "cache.json");
    const a = harness({
      domains: [{ name: "ports", intervalMs: 15, collect: async () => [3000] }],
      cacheFile: file,
    });
    await a.hub.subscribe(1);
    await sleep(30);
    await a.hub.persistNow();
    a.hub.unsubscribe(1);

    // Restart with a WORKING collector returning identical data: the fresh
    // collect must still push (stale → fresh transition matters to clients).
    const b = harness({
      domains: [{ name: "ports", intervalMs: 15, collect: async () => [3000] }],
      cacheFile: file,
    });
    await b.hub.subscribe(1);
    await sleep(30);
    const pushes = b.emitted.filter((e) => e.event === "state");
    expect(pushes.length).toBeGreaterThanOrEqual(2); // stale cache + fresh confirm
    const last = pushes[pushes.length - 1].data as { stale: boolean };
    expect(last.stale).toBe(false);
    b.hub.unsubscribe(1);
  });

  it("stops collecting once the last subscriber leaves", async () => {
    let collects = 0;
    const h = harness({
      domains: [
        {
          name: "ports",
          intervalMs: 10,
          collect: async () => {
            collects += 1;
            return collects;
          },
        },
      ],
    });
    await h.hub.subscribe(1);
    await sleep(25);
    h.hub.unsubscribe(1);
    const frozen = collects;
    await sleep(40);
    expect(collects).toBe(frozen);
  });

  it("tolerates a corrupted cache file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-hub-"));
    const file = join(dir, "cache.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, "not json {");
    const h = harness({
      domains: [{ name: "ports", intervalMs: 15, collect: async () => [1] }],
      cacheFile: file,
    });
    await h.hub.subscribe(1);
    await sleep(30);
    expect(
      h.emitted.filter((e) => e.event === "state").length,
    ).toBeGreaterThanOrEqual(1);
    h.hub.unsubscribe(1);
  });
});

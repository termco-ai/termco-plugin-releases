import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { b64 } from "../protocol";
import { lspFindRoot, lspKill, lspSpawn, lspWhich, lspWrite } from "./lsp";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "termco-server-lsp-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

type Event = { channel: number; event: string; data: unknown };

function collector() {
  const events: Event[] = [];
  return {
    events,
    emit: (channel: number, event: string, data: unknown) =>
      events.push({ channel, event, data }),
  };
}

async function poll(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("poll timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("lspFindRoot", () => {
  it("walks up to the outermost best-priority marker", () => {
    const root = join(tmp, "proj");
    const nested = join(root, "pkg", "src");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, "tsconfig.json"), "{}");
    writeFileSync(join(root, "pkg", "tsconfig.json"), "{}");
    const file = join(nested, "a.ts");
    writeFileSync(file, "");
    expect(
      lspFindRoot({ path: file, markers: ["tsconfig.json"], stopAt: root }),
    ).toEqual({ root });
  });

  it("returns null without markers", () => {
    const bare = join(tmp, "bare", "deep");
    mkdirSync(bare, { recursive: true });
    const file = join(bare, "x.py");
    writeFileSync(file, "");
    expect(
      lspFindRoot({
        path: file,
        markers: ["pyproject.toml"],
        stopAt: join(tmp, "bare"),
      }),
    ).toEqual({ root: null });
  });
});

describe("lspWhich", () => {
  it("finds binaries on PATH and reports misses", () => {
    const binDir = join(tmp, "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "my-ls"), "#!/bin/sh\n");
    const oldPath = process.env.PATH;
    process.env.PATH = `${binDir}:${oldPath}`;
    try {
      const result = lspWhich({ bins: ["my-ls", "definitely-not-here-xyz"] });
      expect(result.found["my-ls"]).toBe(join(binDir, "my-ls"));
      expect(result.found["definitely-not-here-xyz"]).toBeNull();
    } finally {
      process.env.PATH = oldPath;
    }
  });
});

describe("lspSpawn / lspWrite / lspKill", () => {
  it("proxies stdio bytes both ways and reports exit", async () => {
    const c = collector();
    const { handle } = lspSpawn(
      {
        command: process.execPath,
        args: ["-e", "process.stdin.pipe(process.stdout)"],
        cwd: tmp,
        channel: 7,
      },
      c.emit,
    );
    expect(handle).toBeGreaterThan(0);

    const payload = Buffer.from("Content-Length: 2\r\n\r\n{}");
    lspWrite({ handle, chunkB64: b64.encode(payload) });
    await poll(() => c.events.some((e) => e.event === "data"));
    const echoed = Buffer.concat(
      c.events
        .filter((e) => e.event === "data")
        .map((e) => b64.decode((e.data as { chunkB64: string }).chunkB64)),
    );
    expect(echoed.toString("utf8")).toBe(payload.toString("utf8"));
    expect(c.events.every((e) => e.channel === 7)).toBe(true);

    lspKill({ handle });
    await poll(() => c.events.some((e) => e.event === "exit"));
    // Writing to a dead handle throws (the client treats it as session death).
    expect(() => lspWrite({ handle, chunkB64: b64.encode(payload) })).toThrow(
      /unknown lsp handle/,
    );
  });

  it("reports spawn failures as stderr + exit instead of throwing", async () => {
    const c = collector();
    lspSpawn(
      {
        command: "/definitely/not/here/ghost-lsp",
        args: [],
        cwd: tmp,
        channel: 3,
      },
      c.emit,
    );
    await poll(() => c.events.some((e) => e.event === "exit"));
    expect(c.events.some((e) => e.event === "stderr")).toBe(true);
  });
});

/**
 * READ-ONLY timing probe for the session-history scan cost on the REAL
 * coding-agent history on this machine. Opt-in via PERF_SCAN=1; this is a
 * measurement harness, not a regression test.
 */
import { describe, expect, it } from "vitest";
import { listAllSessions, listSessions } from "./sessions";
import { listCodexSessions } from "./codexSessions";

const enabled = !!process.env.PERF_SCAN;

describe.skipIf(!enabled)("session scan cost (real machine data)", () => {
  it("times cold + warm scans", async () => {
    const t0 = performance.now();
    const cpu0 = process.cpuUsage();
    const claude = await listAllSessions();
    const t1 = performance.now();
    const cpu1 = process.cpuUsage(cpu0);
    const codex = await listCodexSessions();
    const t2 = performance.now();
    const cpu2 = process.cpuUsage(cpu0);

    // Warm pass (mtime cache hits — nothing changed on disk since).
    const cpuWarm0 = process.cpuUsage();
    const t3 = performance.now();
    await listAllSessions();
    await listCodexSessions();
    const t4 = performance.now();
    const cpuWarm = process.cpuUsage(cpuWarm0);

    // A rig-switch shaped call: per-cwd listing for this repo.
    const t5 = performance.now();
    const perCwd = await listSessions(process.cwd());
    const t6 = performance.now();

    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      "/tmp/termco-scan-cost.json",
      JSON.stringify(
        {
          claudeSessions: claude.length,
          codexSessions: codex.length,
          coldClaudeMs: Math.round(t1 - t0),
          coldClaudeCpuMs: Math.round((cpu1.user + cpu1.system) / 1000),
          coldCodexMs: Math.round(t2 - t1),
          coldTotalCpuMs: Math.round((cpu2.user + cpu2.system) / 1000),
          warmMs: Math.round(t4 - t3),
          warmCpuMs: Math.round((cpuWarm.user + cpuWarm.system) / 1000),
          perCwdSessions: perCwd.length,
          perCwdWarmMs: Math.round(t6 - t5),
        },
        null,
        2,
      ),
    );
    expect(claude.length).toBeGreaterThanOrEqual(0);
  }, 600_000);

  it("times the live-writer refresh path (append to a big transcript)", async () => {
    const { mkdirSync, rmSync, appendFileSync, writeFileSync } = await import(
      "node:fs"
    );
    const { join } = await import("node:path");
    const { homedir } = await import("node:os");
    const slug = "-tmp-termco-perf-probe";
    const dir = join(homedir(), ".claude", "projects", slug);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "11111111-2222-3333-4444-555555555555.jsonl");
    try {
      // ~30MB of realistic rows (~1KB each).
      const mkRow = (i: number) =>
        `${JSON.stringify({
          type: i % 2 ? "assistant" : "user",
          sessionId: "11111111-2222-3333-4444-555555555555",
          cwd: "/tmp/perf",
          message: {
            content: [
              { type: "text", text: `row ${i} ${"x".repeat(900)}` },
            ],
          },
        })}\n`;
      const chunk: string[] = [];
      for (let i = 0; i < 30_000; i++) chunk.push(mkRow(i));
      writeFileSync(file, chunk.join(""));

      // Cold parse of this one file.
      const c0 = process.cpuUsage();
      const t0 = performance.now();
      await listSessions(slug);
      const t1 = performance.now();
      const c1 = process.cpuUsage(c0);

      // Simulate the live CLI: append one row, then the watcher-triggered
      // refresh re-lists → re-parses the whole changed file today.
      appendFileSync(file, mkRow(30_001));
      const c2 = process.cpuUsage();
      const t2 = performance.now();
      await listSessions(slug);
      const t3 = performance.now();
      const c3 = process.cpuUsage(c2);

      const { appendFileSync: _a } = { appendFileSync };
      writeFileSync(
        "/tmp/termco-append-cost.json",
        JSON.stringify(
          {
            coldOneFileMs: Math.round(t1 - t0),
            coldOneFileCpuMs: Math.round((c1.user + c1.system) / 1000),
            appendRefreshMs: Math.round(t3 - t2),
            appendRefreshCpuMs: Math.round((c3.user + c3.system) / 1000),
          },
          null,
          2,
        ),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(true).toBe(true);
  }, 600_000);
});
// Owned by the coding-agent-native provider plugin.

/**
 * The disk-backed summary cache is what turns the cold history scan from a CPU
 * spike into a no-op: parsed summaries survive an app restart, so only changed
 * transcripts re-parse. These tests prove the round-trip (save → reload) and
 * the RAM-wins merge semantics.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AgentSessionSummary } from "@termco/agents-base";
import {
  flushSummaryCacheSaveForTests,
  initSummaryDiskCache,
  resetSummaryDiskCacheForTests,
  scheduleSummaryCacheSave,
  summaryCache,
  summaryCacheReady,
} from "./summaryDiskCache";

function summary(id: string): AgentSessionSummary {
  return {
    sessionId: id,
    backend: "claude",
    projectSlug: "p",
    name: `Session ${id}`,
    cwd: "/w",
    projectName: "w",
    updatedAt: 1,
    messageCount: 3,
  };
}

afterEach(resetSummaryDiskCacheForTests);

describe("summaryDiskCache", () => {
  it("round-trips summaries across a simulated app restart", async () => {
    const fileA = join(mkdtempSync(join(tmpdir(), "termco-sdc-")), "cache.json");
    initSummaryDiskCache(fileA);
    summaryCache("claude").set("/t/a.jsonl", { mtime: 111, summary: summary("a") });
    summaryCache("codex").set("/t/b.jsonl", { mtime: 222, summary: summary("b") });
    scheduleSummaryCacheSave();
    await flushSummaryCacheSaveForTests();

    // "Restart": drop all RAM state, re-init on the same file, load.
    resetSummaryDiskCacheForTests();
    initSummaryDiskCache(fileA);
    await summaryCacheReady();

    expect(summaryCache("claude").get("/t/a.jsonl")).toEqual({
      mtime: 111,
      summary: summary("a"),
    });
    expect(summaryCache("codex").get("/t/b.jsonl")).toEqual({
      mtime: 222,
      summary: summary("b"),
    });
  });

  it("a live RAM entry wins over the disk copy on load", async () => {
    const fileA = join(mkdtempSync(join(tmpdir(), "termco-sdc-")), "cache.json");
    initSummaryDiskCache(fileA);
    summaryCache("claude").set("/t/a.jsonl", { mtime: 1, summary: summary("old") });
    await flushSummaryCacheSaveForTests();

    resetSummaryDiskCacheForTests();
    initSummaryDiskCache(fileA);
    // A scan already parsed a NEWER version before the disk load finished.
    summaryCache("claude").set("/t/a.jsonl", { mtime: 9, summary: summary("new") });
    await summaryCacheReady();
    expect(summaryCache("claude").get("/t/a.jsonl")?.summary.sessionId).toBe("new");
  });

  it("is a harmless no-op without init (RAM-only mode)", async () => {
    summaryCache("claude").set("/t/a.jsonl", { mtime: 1, summary: summary("a") });
    scheduleSummaryCacheSave(); // no file — must not throw or write
    await summaryCacheReady();
    expect(summaryCache("claude").size).toBe(1);
  });

  it("survives a corrupt cache file (cold scan, no crash)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "termco-sdc-"));
    const fileA = join(dir, "cache.json");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(fileA, "{not json!!", "utf8");
    initSummaryDiskCache(fileA);
    await summaryCacheReady(); // must not throw
    expect(summaryCache("claude").size).toBe(0);
  });
});
// Owned by the coding-agent-native provider plugin.

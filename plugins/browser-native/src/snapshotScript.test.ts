import { describe, expect, it } from "vitest";
import {
  AI_WORLD_ID,
  resolveRefSource,
  scrollSource,
  SNAPSHOT_CHAR_CAP,
  snapshotSource,
} from "./snapshotScript";

describe("snapshotSource", () => {
  it("bakes the epoch and filter into refs and the ref map", () => {
    const src = snapshotSource(7, "viewport");
    expect(src).toContain("const EPOCH = 7;");
    expect(src).toContain('const FILTER = "viewport";');
    expect(src).toContain("globalThis.__termcoAiRefs = refs");
    expect(src).toContain("globalThis.__termcoAiEpoch = EPOCH");
    // Refs are stamped with the epoch: "s" + EPOCH + "e" + n.
    expect(src).toContain('"s" + EPOCH + "e"');
  });

  it("honors the char cap constant", () => {
    expect(snapshotSource(1, "full")).toContain(`const CAP = ${SNAPSHOT_CHAR_CAP}`);
  });

  it("produces a self-contained IIFE", () => {
    const src = snapshotSource(1, "viewport");
    expect(src.trimStart().startsWith("(() =>")).toBe(true);
    expect(src.trimEnd().endsWith("()")).toBe(true);
  });
});

describe("resolveRefSource", () => {
  it("guards against a superseded epoch and detached nodes", () => {
    const src = resolveRefSource("s3e4", 3);
    expect(src).toContain("__termcoAiEpoch !== 3");
    expect(src).toContain('"s3e4"');
    expect(src).toContain("isConnected");
    expect(src).toContain("scrollIntoView");
    expect(src).toContain("isPassword");
  });
});

describe("scrollSource", () => {
  it("scrolls up with a negative delta", () => {
    expect(scrollSource("up", 0.9)).toContain("* -1");
  });
  it("scrolls down with a positive delta", () => {
    expect(scrollSource("down", 0.5)).toContain("* 1");
  });
});

describe("world id", () => {
  it("is a stable non-main isolated world", () => {
    expect(AI_WORLD_ID).toBeGreaterThan(0);
  });
});

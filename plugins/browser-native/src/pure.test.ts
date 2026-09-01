import { describe, expect, it } from "vitest";
import {
  matchChord,
  normalizeRect,
  rectsEqual,
  sanitizeUserAgent,
  viewKey,
  type ChordSpec,
} from "./pure";

describe("viewKey", () => {
  it("is unique per window label and tab id", () => {
    expect(viewKey("main", 3)).toBe("main:3");
    expect(viewKey("main", 3)).not.toBe(viewKey("settings", 3));
    expect(viewKey("main", 3)).not.toBe(viewKey("main", 4));
  });
});

describe("normalizeRect", () => {
  it("rounds fractional CSS-pixel measurements", () => {
    expect(
      normalizeRect({ x: 12.4, y: 8.6, width: 640.5, height: 479.5 }),
    ).toEqual({ x: 12, y: 9, width: 641, height: 480 });
  });

  it("clamps negative sizes to zero", () => {
    expect(normalizeRect({ x: 0, y: 0, width: -5, height: -1 })).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe("rectsEqual", () => {
  const r = { x: 1, y: 2, width: 3, height: 4 };
  it("compares by value", () => {
    expect(rectsEqual(r, { ...r })).toBe(true);
    expect(rectsEqual(r, { ...r, width: 5 })).toBe(false);
  });
  it("handles nulls", () => {
    expect(rectsEqual(null, null)).toBe(true);
    expect(rectsEqual(r, null)).toBe(false);
  });
});

describe("matchChord", () => {
  const chords: ChordSpec[] = [
    { key: "t", meta: true },
    { key: "Tab", control: true },
    { key: "Tab", control: true, shift: true },
  ];

  const keyDown = (input: Partial<Parameters<typeof matchChord>[0]>) => ({
    type: "keyDown",
    key: "t",
    ...input,
  });

  it("matches key + exact modifiers", () => {
    expect(matchChord(keyDown({ key: "t", meta: true }), chords)).toBe(true);
    expect(matchChord(keyDown({ key: "T", meta: true }), chords)).toBe(true);
    expect(matchChord(keyDown({ key: "tab", control: true }), chords)).toBe(
      true,
    );
  });

  it("rejects superset/subset modifiers", () => {
    expect(matchChord(keyDown({ key: "t" }), chords)).toBe(false);
    expect(
      matchChord(keyDown({ key: "t", meta: true, shift: true }), chords),
    ).toBe(false);
  });

  it("matches shift variants only when registered", () => {
    expect(
      matchChord(keyDown({ key: "Tab", control: true, shift: true }), chords),
    ).toBe(true);
    expect(
      matchChord(keyDown({ key: "t", meta: true, alt: true }), chords),
    ).toBe(false);
  });

  it("only fires on key-down events", () => {
    expect(
      matchChord({ type: "keyUp", key: "t", meta: true }, chords),
    ).toBe(false);
    expect(
      matchChord({ type: "rawKeyDown", key: "t", meta: true }, chords),
    ).toBe(true);
  });
});

describe("sanitizeUserAgent", () => {
  it("strips the Electron and app tokens", () => {
    const ua =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) termco/0.1.0 Chrome/130.0.0.0 Electron/40.4.0 Safari/537.36";
    expect(sanitizeUserAgent(ua, "termco")).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    );
  });

  it("escapes regex metacharacters in the app name", () => {
    const ua = "Foo My+App/1.0 Electron/40.0.0 Bar";
    expect(sanitizeUserAgent(ua, "My+App")).toBe("Foo Bar");
  });
});

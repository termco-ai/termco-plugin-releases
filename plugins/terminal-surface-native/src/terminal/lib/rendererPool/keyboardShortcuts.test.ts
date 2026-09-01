// Kept with the source-owning terminal plugin.
import { beforeEach, describe, expect, it, vi } from "vitest";

function key(over: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  } as KeyboardEvent;
}

async function load(userAgent: string) {
  vi.resetModules();
  vi.stubGlobal("navigator", { userAgent });
  return import("./keyboardShortcuts");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("on non-mac platforms", () => {
  it("detects Ctrl+Shift+C as terminal copy", async () => {
    const m = await load("Mozilla/5.0 (X11; Linux x86_64)");
    expect(m.IS_MAC).toBe(false);
    expect(
      m.isTerminalCopy(key({ ctrlKey: true, shiftKey: true, code: "KeyC" })),
    ).toBe(true);
    expect(
      m.isTerminalCopy(key({ ctrlKey: true, shiftKey: true, key: "C" })),
    ).toBe(true);
  });

  it("rejects copy without both Ctrl and Shift or with extra modifiers", async () => {
    const m = await load("Mozilla/5.0 (X11; Linux x86_64)");
    expect(m.isTerminalCopy(key({ ctrlKey: true, code: "KeyC" }))).toBe(false);
    expect(m.isTerminalCopy(key({ shiftKey: true, code: "KeyC" }))).toBe(false);
    expect(
      m.isTerminalCopy(
        key({ ctrlKey: true, shiftKey: true, altKey: true, code: "KeyC" }),
      ),
    ).toBe(false);
    expect(
      m.isTerminalCopy(
        key({ ctrlKey: true, shiftKey: true, metaKey: true, code: "KeyC" }),
      ),
    ).toBe(false);
    expect(
      m.isTerminalCopy(key({ ctrlKey: true, shiftKey: true, code: "KeyX" })),
    ).toBe(false);
  });

  it("detects Ctrl+Shift+V as terminal paste", async () => {
    const m = await load("Mozilla/5.0 (X11; Linux x86_64)");
    expect(
      m.isTerminalPaste(key({ ctrlKey: true, shiftKey: true, code: "KeyV" })),
    ).toBe(true);
    expect(
      m.isTerminalPaste(key({ ctrlKey: true, shiftKey: true, key: "v" })),
    ).toBe(true);
    expect(m.isTerminalPaste(key({ ctrlKey: true, code: "KeyV" }))).toBe(false);
  });
});

describe("on mac", () => {
  it("never treats Ctrl+Shift+C/V as copy or paste", async () => {
    const m = await load("Mozilla/5.0 (Macintosh; Intel Mac OS X)");
    expect(m.IS_MAC).toBe(true);
    expect(
      m.isTerminalCopy(key({ ctrlKey: true, shiftKey: true, code: "KeyC" })),
    ).toBe(false);
    expect(
      m.isTerminalPaste(key({ ctrlKey: true, shiftKey: true, code: "KeyV" })),
    ).toBe(false);
  });
});

describe("isShiftEnter", () => {
  it("matches Shift+Enter without other modifiers on any platform", async () => {
    const m = await load("Mozilla/5.0 (X11; Linux x86_64)");
    expect(m.isShiftEnter(key({ key: "Enter", shiftKey: true }))).toBe(true);
    expect(
      m.isShiftEnter(key({ key: "Enter", shiftKey: true, ctrlKey: true })),
    ).toBe(false);
    expect(
      m.isShiftEnter(key({ key: "Enter", shiftKey: true, metaKey: true })),
    ).toBe(false);
    expect(
      m.isShiftEnter(key({ key: "Enter", shiftKey: true, altKey: true })),
    ).toBe(false);
    expect(m.isShiftEnter(key({ key: "Enter" }))).toBe(false);
    expect(m.isShiftEnter(key({ key: "a", shiftKey: true }))).toBe(false);
  });
});

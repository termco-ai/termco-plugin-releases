import type {
  KeyBinding,
  ShortcutRegistryCapability,
} from "@termco/shortcuts-base";
import { describe, expect, it } from "vitest";
import { formatShortcut } from "./formatShortcut";

function registry(bindings: KeyBinding[]): ShortcutRegistryCapability {
  return {
    snapshot: () => ({ revision: 0, groups: [], shortcuts: [], overrides: {} }),
    subscribe: () => () => {}, bindings: () => bindings, match: () => false,
    format: (binding) => binding
      ? [binding.ctrl ? "Ctrl" : "", binding.alt ? "Alt" : "", binding.key.toUpperCase()].filter(Boolean)
      : [],
    useHandlers: () => {},
    setBindings: async () => {}, reset: async () => {}, resetAll: async () => {},
  };
}

describe("formatShortcut", () => {
  it("returns null when the command has no shortcut id", () => {
    expect(formatShortcut(undefined, registry([]))).toBeNull();
  });

  it("formats the default binding (non-mac fallback)", () => {
    // Without the native bridge the platform probe fails, so MOD_PROP is ctrl.
    expect(formatShortcut("tab.new", registry([{ ctrl: true, key: "t" }]))).toBe("Ctrl T");
  });

  it("prefers the user override over the default", () => {
    expect(formatShortcut("tab.new", registry([{ alt: true, key: "n" }]))).toBe("Alt N");
  });

  it("uses only the primary (first) binding", () => {
    expect(formatShortcut("tab.new", registry([
      { ctrl: true, key: "1" },
      { ctrl: true, key: "2" },
    ]))).toBe("Ctrl 1");
  });

  it("returns null for a shortcut with no bindings", () => {
    // terminal.clear ships unbound off macOS.
    expect(formatShortcut("terminal.clear", registry([]))).toBeNull();
  });

  it("returns null for an empty override list", () => {
    expect(formatShortcut("tab.new", registry([]))).toBeNull();
  });
});

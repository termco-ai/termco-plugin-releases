import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { hasConfiguredModel, shouldTrigger } from "./trigger";
import type { AutocompletePrefs } from "./types";

function prefs(overrides: Partial<AutocompletePrefs> = {}): AutocompletePrefs {
  return {
    enabled: true,
    modelId: "gpt-test",
    ...overrides,
  };
}

function state(doc: string, cursor: number): EditorState {
  return EditorState.create({ doc, selection: { anchor: cursor } });
}

describe("hasConfiguredModel", () => {
  it("requires the selected shared autocomplete model", () => {
    expect(hasConfiguredModel(prefs({ modelId: "gpt-test" }))).toBe(true);
    expect(hasConfiguredModel(prefs({ modelId: "" }))).toBe(false);
    expect(hasConfiguredModel(prefs({ modelId: "   " }))).toBe(false);
  });
});

describe("shouldTrigger", () => {
  it("never triggers when disabled", () => {
    const s = state("const abc = 1;\n", 14);
    expect(shouldTrigger(s, prefs({ enabled: false }), true)).toBe(false);
  });

  it("never triggers without the selected shared model", () => {
    const s = state("const abc = 1;\n", 14);
    expect(shouldTrigger(s, prefs({ modelId: "" }), true)).toBe(false);
  });

  it("never triggers with a non-collapsed selection", () => {
    const s = EditorState.create({
      doc: "const abc = 1;",
      selection: { anchor: 0, head: 5 },
    });
    expect(shouldTrigger(s, prefs(), true)).toBe(false);
  });

  it("manual trigger only needs a collapsed selection and config", () => {
    expect(shouldTrigger(state("", 0), prefs(), true)).toBe(true);
  });

  it("auto trigger requires a non-empty document", () => {
    expect(shouldTrigger(state("", 0), prefs(), false)).toBe(false);
  });

  it("auto trigger skips mid-identifier positions", () => {
    // Cursor between "ab" and "cd" of identifier "abcd".
    const s = state("const abcd = 1;", 8);
    expect(shouldTrigger(s, prefs(), false)).toBe(false);
  });

  it("auto trigger requires recent non-whitespace context", () => {
    expect(shouldTrigger(state("   \n \t ", 7), prefs(), false)).toBe(false);
    expect(shouldTrigger(state("a", 1), prefs(), false)).toBe(false);
  });

  it("auto triggers at the end of a line with context", () => {
    const doc = "const value = compute";
    expect(shouldTrigger(state(doc, doc.length), prefs(), false)).toBe(true);
  });

  it("auto triggers before a non-word character", () => {
    const doc = "call()";
    // Cursor inside the parens, next char is ")".
    expect(shouldTrigger(state(doc, 5), prefs(), false)).toBe(true);
  });
});

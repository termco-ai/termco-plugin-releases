import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { setSuggestion, suggestionField } from "./suggestionState";
import type { Suggestion } from "./types";

function stateWith(doc: string, suggestion: Suggestion | null): EditorState {
  const base = EditorState.create({
    doc,
    extensions: [suggestionField],
    selection: { anchor: suggestion?.from ?? 0 },
  });
  if (!suggestion) return base;
  return base.update({ effects: setSuggestion.of(suggestion) }).state;
}

describe("suggestionField", () => {
  it("starts empty", () => {
    const s = EditorState.create({ extensions: [suggestionField] });
    expect(s.field(suggestionField)).toBeNull();
  });

  it("sets and clears via the effect", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    expect(s.field(suggestionField)).toEqual({ from: 3, text: "def" });
    const cleared = s.update({ effects: setSuggestion.of(null) }).state;
    expect(cleared.field(suggestionField)).toBeNull();
  });

  it("clears on a pure selection change", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const moved = s.update({ selection: { anchor: 1 } }).state;
    expect(moved.field(suggestionField)).toBeNull();
  });

  it("survives unrelated transactions", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const noop = s.update({}).state;
    expect(noop.field(suggestionField)).toEqual({ from: 3, text: "def" });
  });

  it("consumes typed-ahead characters matching the suggestion", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const typed = s.update({
      changes: { from: 3, to: 3, insert: "d" },
      selection: { anchor: 4 },
    }).state;
    expect(typed.field(suggestionField)).toEqual({ from: 4, text: "ef" });
  });

  it("consumes multi-character typed-ahead", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const typed = s.update({
      changes: { from: 3, to: 3, insert: "de" },
      selection: { anchor: 5 },
    }).state;
    expect(typed.field(suggestionField)).toEqual({ from: 5, text: "f" });
  });

  it("drops the suggestion once fully typed out", () => {
    const s = stateWith("abc", { from: 3, text: "d" });
    const typed = s.update({
      changes: { from: 3, to: 3, insert: "d" },
      selection: { anchor: 4 },
    }).state;
    expect(typed.field(suggestionField)).toBeNull();
  });

  it("drops the suggestion on non-matching input", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const typed = s.update({
      changes: { from: 3, to: 3, insert: "x" },
      selection: { anchor: 4 },
    }).state;
    expect(typed.field(suggestionField)).toBeNull();
  });

  it("drops the suggestion on edits away from the anchor", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const typed = s.update({
      changes: { from: 0, to: 0, insert: "z" },
    }).state;
    expect(typed.field(suggestionField)).toBeNull();
  });

  it("drops the suggestion on deletions", () => {
    const s = stateWith("abc", { from: 3, text: "def" });
    const deleted = s.update({
      changes: { from: 2, to: 3, insert: "" },
    }).state;
    expect(deleted.field(suggestionField)).toBeNull();
  });
});

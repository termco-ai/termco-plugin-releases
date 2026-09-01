// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { GhostWidget, ghostDecorations, ghostTheme } from "./ghostWidget";
import { setSuggestion, suggestionField } from "./suggestionState";

describe("GhostWidget", () => {
  it("renders single-line ghost text", () => {
    const el = new GhostWidget("hello").toDOM();
    expect(el.className).toBe("cm-ai-ghost");
    expect(el.textContent).toBe("hello");
    expect(el.querySelector("br")).toBeNull();
  });

  it("renders multi-line ghost text with <br> separators", () => {
    const el = new GhostWidget("a\nb\nc").toDOM();
    expect(el.textContent).toBe("abc");
    expect(el.querySelectorAll("br")).toHaveLength(2);
  });

  it("compares by text", () => {
    const w = new GhostWidget("x");
    expect(w.eq(new GhostWidget("x"))).toBe(true);
    expect(w.eq(new GhostWidget("y"))).toBe(false);
  });

  it("ignores DOM events", () => {
    expect(new GhostWidget("x").ignoreEvent()).toBe(true);
  });
});

describe("ghostDecorations", () => {
  function stateWith(suggestion: { from: number; text: string } | null) {
    const base = EditorState.create({
      doc: "abc",
      extensions: [suggestionField, ghostDecorations],
    });
    if (!suggestion) return base;
    return base.update({ effects: setSuggestion.of(suggestion) }).state;
  }

  it("is empty without a suggestion", () => {
    const state = stateWith(null);
    const sets = state
      .facet(EditorView.decorations)
      .filter((d) => typeof d !== "function");
    expect(sets).toEqual([Decoration.none]);
  });

  it("produces one widget decoration at the suggestion anchor", () => {
    const state = stateWith({ from: 2, text: "ghost" });
    const sets = state
      .facet(EditorView.decorations)
      .filter((d) => typeof d !== "function");
    expect(sets).toHaveLength(1);
    const it = sets[0].iter();
    expect(it.value).not.toBeNull();
    expect(it.from).toBe(2);
    it.next();
    expect(it.value).toBeNull();
  });

  it("renders the ghost widget in a mounted view", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "const a = ",
        selection: { anchor: 10 },
        extensions: [suggestionField, ghostDecorations, ghostTheme],
      }),
      parent: document.body,
    });
    try {
      view.dispatch({ effects: setSuggestion.of({ from: 10, text: "1;" }) });
      const ghost = view.dom.querySelector(".cm-ai-ghost");
      expect(ghost).not.toBeNull();
      expect(ghost?.textContent).toBe("1;");
    } finally {
      view.destroy();
    }
  });

  it("removes the widget when the suggestion clears", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "x",
        selection: { anchor: 1 },
        extensions: [suggestionField, ghostDecorations],
      }),
      parent: document.body,
    });
    try {
      view.dispatch({ effects: setSuggestion.of({ from: 1, text: "yz" }) });
      expect(view.dom.querySelector(".cm-ai-ghost")).not.toBeNull();
      view.dispatch({ effects: setSuggestion.of(null) });
      expect(view.dom.querySelector(".cm-ai-ghost")).toBeNull();
    } finally {
      view.destroy();
    }
  });
});

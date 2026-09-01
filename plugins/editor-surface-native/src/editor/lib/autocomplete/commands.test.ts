// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { acceptSuggestion, acceptWord, dismissSuggestion } from "./commands";
import { setSuggestion, suggestionField } from "./suggestionState";

let view: EditorView | null = null;

function makeView(doc: string, cursor: number): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [suggestionField],
    }),
    parent: document.body,
  });
  return view;
}

function suggest(v: EditorView, from: number, text: string) {
  v.dispatch({ effects: setSuggestion.of({ from, text }) });
}

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("acceptSuggestion", () => {
  it("returns false without an active suggestion", () => {
    const v = makeView("abc", 3);
    expect(acceptSuggestion(v)).toBe(false);
  });

  it("inserts the full suggestion and clears the ghost", () => {
    const v = makeView("const x = ", 10);
    suggest(v, 10, "1 + 2;");
    expect(acceptSuggestion(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("const x = 1 + 2;");
    expect(v.state.selection.main.head).toBe(16);
    expect(v.state.field(suggestionField)).toBeNull();
  });
});

describe("acceptWord", () => {
  it("returns false without an active suggestion", () => {
    const v = makeView("abc", 3);
    expect(acceptWord(v)).toBe(false);
  });

  it("inserts only the next word and keeps the remainder as ghost", () => {
    const v = makeView("", 0);
    suggest(v, 0, "return value;");
    expect(acceptWord(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("return");
    expect(v.state.field(suggestionField)).toEqual({
      from: 6,
      text: " value;",
    });
  });

  it("takes leading whitespace together with the word", () => {
    const v = makeView("a", 1);
    suggest(v, 1, " next");
    expect(acceptWord(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("a next");
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("takes a punctuation run when no word leads", () => {
    const v = makeView("call", 4);
    suggest(v, 4, "();");
    expect(acceptWord(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("call();");
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("clears the ghost when the last chunk is accepted", () => {
    const v = makeView("", 0);
    suggest(v, 0, "done");
    expect(acceptWord(v)).toBe(true);
    expect(v.state.field(suggestionField)).toBeNull();
  });
});

describe("dismissSuggestion", () => {
  it("returns false without an active suggestion", () => {
    const v = makeView("abc", 3);
    expect(dismissSuggestion(v)).toBe(false);
  });

  it("clears the ghost without changing the document", () => {
    const v = makeView("abc", 3);
    suggest(v, 3, "def");
    expect(dismissSuggestion(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("abc");
    expect(v.state.field(suggestionField)).toBeNull();
  });
});

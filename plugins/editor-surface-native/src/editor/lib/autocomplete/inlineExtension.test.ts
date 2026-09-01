// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestCompletion = vi.fn();

vi.mock("./provider", () => ({
  requestCompletion: (...args: unknown[]) => requestCompletion(...args),
}));

import { inlineCompletion } from "./inlineExtension";
import { setSuggestion, suggestionField } from "./suggestionState";
import type { AutocompletePrefs } from "./types";

const PREFS: AutocompletePrefs = {
  enabled: true,
  modelId: "gpt-test",
};

let view: EditorView | null = null;

function makeView(doc: string, cursor: number): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: inlineCompletion({
        getPrefs: () => PREFS,
        getPath: () => null,
        getLanguage: () => null,
      }),
    }),
    parent: document.body,
  });
  return view;
}

function key(v: EditorView, init: KeyboardEventInit) {
  v.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
  );
}

beforeEach(() => {
  requestCompletion.mockReset().mockResolvedValue("");
});

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("inlineCompletion", () => {
  it("installs the suggestion field and ghost rendering", () => {
    const v = makeView("abc", 3);
    expect(v.state.field(suggestionField)).toBeNull();
    v.dispatch({ effects: setSuggestion.of({ from: 3, text: "def" }) });
    expect(v.dom.querySelector(".cm-ai-ghost")?.textContent).toBe("def");
  });

  it("Tab accepts the active suggestion", () => {
    const v = makeView("abc", 3);
    v.dispatch({ effects: setSuggestion.of({ from: 3, text: "def" }) });
    key(v, { key: "Tab" });
    expect(v.state.doc.toString()).toBe("abcdef");
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("Tab falls through when no suggestion is active", () => {
    const v = makeView("abc", 3);
    key(v, { key: "Tab" });
    expect(v.state.doc.toString()).toBe("abc");
  });

  it("Escape dismisses the active suggestion", () => {
    const v = makeView("abc", 3);
    v.dispatch({ effects: setSuggestion.of({ from: 3, text: "def" }) });
    key(v, { key: "Escape" });
    expect(v.state.doc.toString()).toBe("abc");
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("Mod-ArrowRight accepts one word", () => {
    const v = makeView("", 0);
    v.dispatch({ effects: setSuggestion.of({ from: 0, text: "one two" }) });
    // jsdom reports a non-Mac platform, so Mod resolves to Ctrl.
    key(v, { key: "ArrowRight", ctrlKey: true });
    expect(v.state.doc.toString()).toBe("one");
    expect(v.state.field(suggestionField)).toEqual({ from: 3, text: " two" });
  });

  it("Alt-\\ manually triggers a completion request", async () => {
    vi.useFakeTimers();
    try {
      const v = makeView("abc", 3);
      key(v, { key: "\\", altKey: true });
      await vi.advanceTimersByTimeAsync(5);
      expect(requestCompletion).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

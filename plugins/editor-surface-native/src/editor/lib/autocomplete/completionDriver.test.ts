// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestCompletion = vi.fn();

vi.mock("./provider", () => ({
  requestCompletion: (...args: unknown[]) => requestCompletion(...args),
}));

import { CHAIN_DELAY_MS, DEBOUNCE_MS } from "./constants";
import { inlineCompletion } from "./inlineExtension";
import { suggestionField } from "./suggestionState";
import type { AutocompletePrefs } from "./types";

function prefs(overrides: Partial<AutocompletePrefs> = {}): AutocompletePrefs {
  return {
    enabled: true,
    modelId: "gpt-test",
    ...overrides,
  };
}

let view: EditorView | null = null;

function makeView(
  doc: string,
  cursor: number,
  p: AutocompletePrefs = prefs(),
): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: inlineCompletion({
        getPrefs: () => p,
        getPath: () => "/ws/file.ts",
        getLanguage: () => "ts",
      }),
    }),
    parent: document.body,
  });
  return view;
}

function type(v: EditorView, text: string) {
  const at = v.state.selection.main.head;
  v.dispatch({
    changes: { from: at, to: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: "input.type",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  requestCompletion.mockReset().mockResolvedValue("pute();");
});

afterEach(() => {
  view?.destroy();
  view = null;
  vi.useRealTimers();
});

describe("CompletionDriver", () => {
  it("debounces typed input and applies the trimmed ghost", async () => {
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 10);
    expect(requestCompletion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    const [req] = requestCompletion.mock.calls[0];
    expect(req).toMatchObject({
      prefix: "const value = com",
      suffix: "",
      filename: "/ws/file.ts",
      language: "ts",
    });
    expect(v.state.field(suggestionField)).toEqual({
      from: 17,
      text: "pute();",
    });
  });

  it("does not fire when prefs are disabled", async () => {
    const v = makeView("const value = co", 16, prefs({ enabled: false }));
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("serves a repeat position from the cache", async () => {
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(requestCompletion).toHaveBeenCalledTimes(1);

    // Dismiss, delete the typed char, and retype it: same context key.
    v.dispatch({
      changes: { from: 16, to: 17, insert: "" },
      userEvent: "delete.backward",
    });
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    expect(v.state.field(suggestionField)).toEqual({
      from: 17,
      text: "pute();",
    });
  });

  it("cancels pending work on delete", async () => {
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    v.dispatch({
      changes: { from: 16, to: 17, insert: "" },
      userEvent: "delete.backward",
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("cancels pending work on a pure cursor move", async () => {
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS / 2);
    v.dispatch({ selection: { anchor: 0 }, userEvent: "select" });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
  });

  it("discards an in-flight result after the cursor moved", async () => {
    let resolve: (raw: string) => void = () => {};
    requestCompletion.mockReturnValueOnce(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
    const signal = requestCompletion.mock.calls[0][2] as AbortSignal;
    v.dispatch({ selection: { anchor: 0 }, userEvent: "select" });
    expect(signal.aborted).toBe(true);
    resolve("pute();");
    await vi.advanceTimersByTimeAsync(10);
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("does not apply a ghost when the trim produces nothing", async () => {
    requestCompletion.mockResolvedValueOnce("");
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(v.state.field(suggestionField)).toBeNull();

    // Empty results are not cached: the same position retries.
    v.dispatch({
      changes: { from: 16, to: 17, insert: "" },
      userEvent: "delete.backward",
    });
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(requestCompletion).toHaveBeenCalledTimes(2);
  });

  it("swallows request errors without applying a ghost", async () => {
    requestCompletion.mockRejectedValueOnce(new Error("network down"));
    const v = makeView("const value = co", 16);
    type(v, "m");
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 10);
    expect(v.state.field(suggestionField)).toBeNull();
  });

  it("chains a fast follow-up after an ai completion insert", async () => {
    const v = makeView("const value = com", 17);
    v.dispatch({
      changes: { from: 17, to: 17, insert: "pute" },
      selection: { anchor: 21 },
      userEvent: "input.complete.ai",
    });
    await vi.advanceTimersByTimeAsync(CHAIN_DELAY_MS + 10);
    expect(requestCompletion).toHaveBeenCalledTimes(1);
  });

  it("cleans up its timer on destroy", async () => {
    const v = makeView("const value = co", 16);
    type(v, "m");
    v.destroy();
    view = null;
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(requestCompletion).not.toHaveBeenCalled();
  });
});

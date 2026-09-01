// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { historyOpen, historyPopover } from "./index";
import { historyField } from "./state";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let view: EditorView | null = null;

function makeView(
  fetch: (query: string, limit: number) => Promise<string[]>,
  doc = "",
) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({ doc, extensions: historyPopover(fetch) }),
    parent,
  });
  return view;
}

function key(v: EditorView, k: string) {
  v.contentDOM.dispatchEvent(
    new KeyboardEvent("keydown", { key: k, bubbles: true }),
  );
}

afterEach(() => {
  vi.useRealTimers();
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("historyPopover", () => {
  it("opens on ArrowUp from the first line with the current query", async () => {
    const fetch = vi.fn(() => Promise.resolve(["git status", "git log"]));
    const v = makeView(fetch, "git");
    key(v, "ArrowUp");
    await sleep(10);
    expect(fetch).toHaveBeenCalledWith("git", 200);
    expect(historyOpen(v.state)).toBe(true);
    expect(v.state.field(historyField).items).toEqual([
      "git status",
      "git log",
    ]);
  });

  it("stays closed when the history has no matches", async () => {
    const fetch = vi.fn(() => Promise.resolve([]));
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await sleep(10);
    expect(historyOpen(v.state)).toBe(false);
  });

  it("does not open from a line below the first", async () => {
    const fetch = vi.fn(() => Promise.resolve(["x"]));
    const v = makeView(fetch, "one\ntwo");
    v.dispatch({ selection: { anchor: v.state.doc.length } });
    key(v, "ArrowUp");
    await sleep(10);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("navigates up and down through the list", async () => {
    const fetch = vi.fn(() => Promise.resolve(["a", "b", "c"]));
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await sleep(10);
    key(v, "ArrowDown");
    expect(v.state.field(historyField).index).toBe(1);
    key(v, "ArrowUp");
    expect(v.state.field(historyField).index).toBe(0);
    // At the top, ArrowUp keeps the popover open on the first item.
    key(v, "ArrowUp");
    expect(v.state.field(historyField).index).toBe(0);
    expect(historyOpen(v.state)).toBe(true);
  });

  it("closes when ArrowDown moves past the last item", async () => {
    const fetch = vi.fn(() => Promise.resolve(["only"]));
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await sleep(10);
    key(v, "ArrowDown");
    expect(historyOpen(v.state)).toBe(false);
  });

  it("accepts the selected command with Enter", async () => {
    const fetch = vi.fn(() => Promise.resolve(["make test", "make lint"]));
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await sleep(10);
    key(v, "ArrowDown");
    key(v, "Enter");
    expect(v.state.doc.toString()).toBe("make lint");
    expect(historyOpen(v.state)).toBe(false);
  });

  it("dismisses with Escape", async () => {
    const fetch = vi.fn(() => Promise.resolve(["x"]));
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await sleep(10);
    key(v, "Escape");
    expect(historyOpen(v.state)).toBe(false);
  });

  it("refilters the open list when the query changes", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((q: string) =>
      Promise.resolve(q === "gl" ? ["git log"] : ["git log", "git status"]),
    );
    const v = makeView(fetch);
    key(v, "ArrowUp");
    await vi.runAllTimersAsync();
    expect(v.state.field(historyField).items).toHaveLength(2);
    v.dispatch({ changes: { from: 0, insert: "gl" } });
    await vi.runAllTimersAsync();
    expect(fetch).toHaveBeenLastCalledWith("gl", 200);
    expect(v.state.field(historyField).items).toEqual(["git log"]);
    expect(v.state.field(historyField).index).toBe(0);
  });

  it("does not refilter while closed", async () => {
    const fetch = vi.fn(() => Promise.resolve(["x"]));
    const v = makeView(fetch);
    v.dispatch({ changes: { from: 0, insert: "g" } });
    await sleep(100);
    expect(fetch).not.toHaveBeenCalled();
  });
});

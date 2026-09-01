// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptInlineSuggestion, inlineSuggestion } from "./inlineSuggest";

const FETCH_DEBOUNCE_MS = 70;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

let view: EditorView | null = null;

function makeView(fetch: (line: string) => Promise<string | null>) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({ doc: "", extensions: inlineSuggestion(fetch) }),
    parent,
  });
  return view;
}

function type(v: EditorView, text: string) {
  v.dispatch({
    changes: { from: v.state.doc.length, insert: text },
    selection: { anchor: v.state.doc.length + text.length },
  });
}

async function settleFetch() {
  await sleep(FETCH_DEBOUNCE_MS + 30);
}

function ghost(v: EditorView): string | null {
  return v.dom.querySelector(".cm-ghost")?.textContent ?? null;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("inlineSuggestion", () => {
  it("shows the suggestion tail as a ghost after the debounce", async () => {
    const fetch = vi.fn(() => Promise.resolve("git status"));
    const v = makeView(fetch);
    type(v, "git st");
    await settleFetch();
    expect(fetch).toHaveBeenCalledWith("git st");
    expect(ghost(v)).toBe("atus");
  });

  it("cancels the pending fetch when the line empties before the debounce", async () => {
    const fetch = vi.fn(() => Promise.resolve("anything"));
    const v = makeView(fetch);
    type(v, "a");
    v.dispatch({ changes: { from: 0, to: 1 } });
    await settleFetch();
    expect(fetch).not.toHaveBeenCalled();
    expect(ghost(v)).toBeNull();
  });

  it("drops a stale response for an outdated line", async () => {
    let resolver: (s: string | null) => void = () => {};
    const fetch = vi.fn(
      () =>
        new Promise<string | null>((r) => {
          resolver = r;
        }),
    );
    const v = makeView(fetch);
    type(v, "gi");
    await sleep(FETCH_DEBOUNCE_MS + 20);
    // The doc moved on before the fetch resolved.
    type(v, "x");
    resolver("git status");
    await sleep(FETCH_DEBOUNCE_MS + 40);
    expect(ghost(v)).toBeNull();
  });

  it("keeps the ghost shrinking while typing matches the suggestion", async () => {
    const fetch = vi.fn((line: string) =>
      Promise.resolve(line.startsWith("g") ? "git status" : null),
    );
    const v = makeView(fetch);
    type(v, "g");
    await settleFetch();
    expect(ghost(v)).toBe("it status");
    type(v, "it");
    expect(ghost(v)).toBe(" status");
  });

  it("clears the suggestion when typing diverges", async () => {
    const fetch = vi.fn(() => Promise.resolve("git status"));
    const v = makeView(fetch);
    type(v, "git");
    await settleFetch();
    expect(ghost(v)).toBe(" status");
    type(v, "z");
    expect(ghost(v)).toBeNull();
  });

  it("hides the ghost when the cursor is not at the end", async () => {
    const fetch = vi.fn(() => Promise.resolve("git status"));
    const v = makeView(fetch);
    type(v, "git");
    await settleFetch();
    v.dispatch({ selection: { anchor: 1 } });
    expect(ghost(v)).toBeNull();
  });

  it("acceptInlineSuggestion inserts the tail and moves the cursor", async () => {
    const fetch = vi.fn(() => Promise.resolve("git status"));
    const v = makeView(fetch);
    type(v, "git st");
    await settleFetch();
    expect(acceptInlineSuggestion(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("git status");
    expect(v.state.selection.main.head).toBe("git status".length);
    expect(ghost(v)).toBeNull();
  });

  it("acceptInlineSuggestion is a no-op without a suggestion", () => {
    const v = makeView(() => Promise.resolve(null));
    type(v, "ls");
    expect(acceptInlineSuggestion(v)).toBe(false);
    expect(v.state.doc.toString()).toBe("ls");
  });

  it("accepts via the ArrowRight keybinding", async () => {
    const fetch = vi.fn(() => Promise.resolve("make build"));
    const v = makeView(fetch);
    type(v, "make");
    await settleFetch();
    v.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(v.state.doc.toString()).toBe("make build");
  });

  it("swallows fetch failures", async () => {
    const fetch = vi.fn(() => Promise.reject(new Error("db locked")));
    const v = makeView(fetch);
    type(v, "boom");
    await settleFetch();
    expect(ghost(v)).toBeNull();
  });
});

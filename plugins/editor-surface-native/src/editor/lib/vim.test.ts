// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { type CodeMirrorV, getCM, Vim, vim } from "@replit/codemirror-vim";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initVimGlobals, type VimHandlers, vimHandlersExtension } from "./vim";

let view: EditorView | null = null;

function makeView(handlers: VimHandlers): EditorView {
  view = new EditorView({
    state: EditorState.create({
      doc: "hello",
      extensions: [vim(), vimHandlersExtension(() => handlers)],
    }),
    parent: document.body,
  });
  return view;
}

function ex(v: EditorView, command: string) {
  const cm = getCM(v);
  if (!cm) throw new Error("no vim adapter on view");
  Vim.handleEx(cm as CodeMirrorV, command);
}

beforeEach(() => {
  initVimGlobals();
});

afterEach(() => {
  view?.destroy();
  view = null;
});

describe("initVimGlobals", () => {
  it("is idempotent", () => {
    expect(() => {
      initVimGlobals();
      initVimGlobals();
    }).not.toThrow();
  });
});

describe("vim ex command handlers", () => {
  it(":w calls save", () => {
    const save = vi.fn();
    const close = vi.fn();
    const v = makeView({ save, close });
    ex(v, "w");
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
  });

  it(":q calls close", () => {
    const save = vi.fn();
    const close = vi.fn();
    const v = makeView({ save, close });
    ex(v, "q");
    expect(close).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
  });

  it(":wq saves then closes", () => {
    const calls: string[] = [];
    const v = makeView({
      save: () => calls.push("save"),
      close: () => calls.push("close"),
    });
    ex(v, "wq");
    expect(calls).toEqual(["save", "close"]);
  });

  it(":x saves then closes", () => {
    const calls: string[] = [];
    const v = makeView({
      save: () => calls.push("save"),
      close: () => calls.push("close"),
    });
    ex(v, "x");
    expect(calls).toEqual(["save", "close"]);
  });

  it("reads fresh handlers on every invocation", () => {
    const first = vi.fn();
    const second = vi.fn();
    let current: VimHandlers = { save: first, close: () => {} };
    view = new EditorView({
      state: EditorState.create({
        doc: "x",
        extensions: [vim(), vimHandlersExtension(() => current)],
      }),
      parent: document.body,
    });
    ex(view, "w");
    expect(first).toHaveBeenCalledTimes(1);
    current = { save: second, close: () => {} };
    // An update refreshes the handler registration.
    view.dispatch({ changes: { from: 0, to: 0, insert: "y" } });
    ex(view, "w");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on a view without registered handlers", () => {
    const bare = new EditorView({
      state: EditorState.create({ doc: "x", extensions: [vim()] }),
      parent: document.body,
    });
    view = bare;
    expect(() => ex(bare, "w")).not.toThrow();
    expect(() => ex(bare, "q")).not.toThrow();
    expect(() => ex(bare, "wq")).not.toThrow();
  });
});

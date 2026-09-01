// @vitest-environment jsdom
import { history } from "@codemirror/commands";
import { search } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactCodeMirrorRef } from "@uiw/react-codemirror";
import type { RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type EditorPaneHandle,
  useEditorPaneImperativeHandle,
} from "./useEditorPaneImperativeHandle";

let view: EditorView | null = null;

function setup(doc = "alpha beta\ngamma beta\n") {
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [search({ top: true }), history()],
    }),
    parent: document.body,
  });
  const cmRef = {
    current: { view } as ReactCodeMirrorRef,
  } as RefObject<ReactCodeMirrorRef | null>;
  const ref = { current: null as EditorPaneHandle | null };
  const applyPendingGoto = vi.fn();
  const save = vi.fn(async () => {});
  const saveRef = { current: save } as RefObject<() => Promise<unknown>>;
  const reload = vi.fn(() => true);
  const reloadRef = { current: reload } as RefObject<() => boolean>;
  const pendingLineRef = { current: null } as RefObject<{
    line: number;
    character?: number;
  } | null>;
  renderHook(() =>
    useEditorPaneImperativeHandle(ref, {
      cmRef,
      path: "/ws/file.ts",
      applyPendingGoto,
      saveRef,
      reloadRef,
      pendingLineRef,
    }),
  );
  if (!ref.current) throw new Error("imperative handle not attached");
  return {
    handle: ref.current,
    view: view as EditorView,
    cmRef,
    applyPendingGoto,
    save,
    reload,
    pendingLineRef,
  };
}

afterEach(() => {
  cleanup();
  view?.destroy();
  view = null;
});

describe("useEditorPaneImperativeHandle", () => {
  it("save() delegates to the pane's save entry point", async () => {
    const { handle, save } = setup();
    await handle.save();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("exposes the file path", () => {
    const { handle } = setup();
    expect(handle.getPath()).toBe("/ws/file.ts");
  });

  it("proxies reload through the ref", () => {
    const { handle, reload } = setup();
    expect(handle.reload()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("gotoLine records the pending line and applies it", () => {
    const { handle, applyPendingGoto, pendingLineRef } = setup();
    handle.gotoLine(2);
    expect(pendingLineRef.current).toEqual({ line: 2, character: undefined });
    expect(applyPendingGoto).toHaveBeenCalledTimes(1);
  });

  it("getSelection returns null for a collapsed selection", () => {
    const { handle } = setup();
    expect(handle.getSelection()).toBeNull();
  });

  it("getSelection returns the selected text", () => {
    const { handle, view: v } = setup();
    v.dispatch({ selection: { anchor: 0, head: 5 } });
    expect(handle.getSelection()).toBe("alpha");
  });

  it("setQuery selects the first match", () => {
    const { handle, view: v } = setup();
    handle.setQuery("beta");
    const { from, to } = v.state.selection.main;
    expect(v.state.sliceDoc(from, to)).toBe("beta");
    expect(from).toBe(6);
  });

  it("findNext advances to the following match", () => {
    const { handle, view: v } = setup();
    handle.setQuery("beta");
    handle.findNext();
    expect(v.state.selection.main.from).toBe(17);
  });

  it("findPrevious returns to the earlier match", () => {
    const { handle, view: v } = setup();
    handle.setQuery("beta");
    handle.findNext();
    handle.findPrevious();
    expect(v.state.selection.main.from).toBe(6);
  });

  it("clearQuery resets the search without throwing", () => {
    const { handle } = setup();
    handle.setQuery("beta");
    expect(() => handle.clearQuery()).not.toThrow();
  });

  it("undo and redo run against the view history", () => {
    const { handle, view: v } = setup("start");
    v.dispatch({
      changes: { from: 5, to: 5, insert: " typed" },
      userEvent: "input.type",
    });
    expect(v.state.doc.toString()).toBe("start typed");
    handle.undo();
    expect(v.state.doc.toString()).toBe("start");
    handle.redo();
    expect(v.state.doc.toString()).toBe("start typed");
  });

  it("focus focuses the editor view", () => {
    const { handle, view: v } = setup();
    const spy = vi.spyOn(v, "focus");
    handle.focus();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("all view-backed methods are no-ops without a mounted view", () => {
    const { handle, cmRef } = setup();
    (cmRef as { current: ReactCodeMirrorRef | null }).current = null;
    expect(() => {
      handle.setQuery("x");
      handle.findNext();
      handle.findPrevious();
      handle.clearQuery();
      handle.focus();
      handle.undo();
      handle.redo();
    }).not.toThrow();
    expect(handle.getSelection()).toBeNull();
  });
});

// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
// Note: the tooltip's DOM (historyTooltipView) never materializes under jsdom
// because CodeMirror skips tooltip layout without real geometry; these tests
// cover the exported state field and its dispatch helpers instead.
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptIndex,
  CLOSED,
  close,
  dispatch,
  historyField,
  historyOpen,
} from "./state";

let view: EditorView | null = null;

function makeView(doc = "") {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [historyField] }),
    parent,
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("history popover state", () => {
  it("starts closed", () => {
    const v = makeView();
    expect(historyOpen(v.state)).toBe(false);
    expect(v.state.field(historyField)).toEqual(CLOSED);
  });

  it("reports closed for states without the field", () => {
    const bare = EditorState.create({ doc: "" });
    expect(historyOpen(bare)).toBe(false);
  });

  it("opens with items and a selection index", () => {
    const v = makeView();
    dispatch(v, { open: true, items: ["ls -la", "git st"], index: 1 });
    expect(historyOpen(v.state)).toBe(true);
    expect(v.state.field(historyField)).toEqual({
      open: true,
      items: ["ls -la", "git st"],
      index: 1,
    });
  });

  it("keeps the field value across unrelated transactions", () => {
    const v = makeView();
    dispatch(v, { open: true, items: ["a"], index: 0 });
    v.dispatch({ changes: { from: 0, insert: "typed" } });
    expect(v.state.field(historyField).open).toBe(true);
    expect(v.state.field(historyField).items).toEqual(["a"]);
  });

  it("close() dismisses only when open", () => {
    const v = makeView();
    const spy = vi.spyOn(v, "dispatch");
    close(v);
    expect(spy).not.toHaveBeenCalled();
    dispatch(v, { open: true, items: ["x"], index: 0 });
    close(v);
    expect(historyOpen(v.state)).toBe(false);
    expect(v.state.field(historyField)).toEqual(CLOSED);
  });

  it("acceptIndex replaces the doc with the chosen command and closes", () => {
    const v = makeView("gi");
    dispatch(v, { open: true, items: ["git status", "git log"], index: 1 });
    acceptIndex(v, 1);
    expect(v.state.doc.toString()).toBe("git log");
    expect(v.state.selection.main.head).toBe("git log".length);
    expect(historyOpen(v.state)).toBe(false);
  });

  it("acceptIndex with an out-of-range index just closes", () => {
    const v = makeView("gi");
    dispatch(v, { open: true, items: ["git status"], index: 0 });
    acceptIndex(v, 5);
    expect(v.state.doc.toString()).toBe("gi");
    expect(historyOpen(v.state)).toBe(false);
  });

  it("acceptIndex on a closed popover leaves the doc untouched", () => {
    const v = makeView("keep me");
    acceptIndex(v, 0);
    expect(v.state.doc.toString()).toBe("keep me");
  });
});

// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { applyMinimalEdit } from "./format";

function makeView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc }) });
}

describe("applyMinimalEdit", () => {
  it("touches only the differing middle span (cursor survives)", () => {
    const view = makeView("const a=1;\nconst b=2;\nconst c=3;\n");
    // Cursor inside the LAST line, which formatting doesn't change.
    const anchor = view.state.doc.toString().indexOf("c=3");
    view.dispatch({ selection: { anchor } });
    const changed = applyMinimalEdit(
      view,
      "const a = 1;\nconst b = 2;\nconst c=3;\n",
    );
    expect(changed).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "const a = 1;\nconst b = 2;\nconst c=3;\n",
    );
    // Selection was mapped through the edit, still on "c=3".
    const head = view.state.selection.main.head;
    expect(view.state.doc.sliceString(head, head + 3)).toBe("c=3");
  });

  it("no-ops on identical content", () => {
    const view = makeView("same\n");
    expect(applyMinimalEdit(view, "same\n")).toBe(false);
  });

  it("handles pure insertions and deletions at the edges", () => {
    const view = makeView("b\n");
    applyMinimalEdit(view, "a\nb\n");
    expect(view.state.doc.toString()).toBe("a\nb\n");
    applyMinimalEdit(view, "a\n");
    expect(view.state.doc.toString()).toBe("a\n");
  });
});

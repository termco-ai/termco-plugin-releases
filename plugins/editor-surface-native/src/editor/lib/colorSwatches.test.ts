// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { colorSwatches } from "./colorSwatches";

let view: EditorView | null = null;

function makeView(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [colorSwatches()] }),
    parent: document.body,
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

function swatches(v: EditorView): HTMLElement[] {
  return [...v.dom.querySelectorAll<HTMLElement>(".cm-color-swatch")];
}

describe("colorSwatches", () => {
  it("renders no swatches for a doc without colors", () => {
    const v = makeView("const a = 1;");
    expect(swatches(v)).toHaveLength(0);
  });

  it("decorates hex colors with an editable swatch", () => {
    const v = makeView('color: "#ff0000";');
    const els = swatches(v);
    expect(els).toHaveLength(1);
    expect(els[0].style.backgroundColor).toBe("rgb(255, 0, 0)");
    const input = els[0].querySelector<HTMLInputElement>(
      ".cm-color-swatch-input",
    );
    expect(input).not.toBeNull();
    expect(input?.value).toBe("#ff0000");
  });

  it("expands 3-digit hex for the picker input", () => {
    const v = makeView("#abc");
    const input = swatches(v)[0].querySelector<HTMLInputElement>("input");
    expect(input?.value).toBe("#aabbcc");
  });

  it("decorates rgb()/hsl() colors with a non-editable swatch", () => {
    const v = makeView(
      "background: rgba(10, 20, 30, 0.5); c: hsl(120 50% 50%)",
    );
    const els = swatches(v);
    expect(els).toHaveLength(2);
    for (const el of els) {
      expect(el.querySelector("input")).toBeNull();
    }
  });

  it("replaces the hex text in the document on picker change", () => {
    const v = makeView("#ff0000");
    const input = swatches(v)[0].querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("missing swatch input");
    input.value = "#00ff00";
    input.dispatchEvent(new Event("change"));
    expect(v.state.doc.toString()).toBe("#00ff00");
  });

  it("preserves the alpha channel of 8-digit hex on change", () => {
    const v = makeView("#ff000080");
    const input = swatches(v)[0].querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("missing swatch input");
    expect(input.value).toBe("#ff0000");
    input.value = "#0000ff";
    input.dispatchEvent(new Event("change"));
    expect(v.state.doc.toString()).toBe("#0000ff80");
  });

  it("preserves the alpha nibble of 4-digit hex on change", () => {
    const v = makeView("#f008");
    const input = swatches(v)[0].querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("missing swatch input");
    input.value = "#00ff00";
    input.dispatchEvent(new Event("change"));
    expect(v.state.doc.toString()).toBe("#00ff0088");
  });

  it("previews the picked color on input without changing the doc", () => {
    const v = makeView("#ff0000");
    const el = swatches(v)[0];
    const input = el.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("missing swatch input");
    input.value = "#123456";
    input.dispatchEvent(new Event("input"));
    expect(el.style.backgroundColor).toBe("rgb(18, 52, 86)");
    expect(v.state.doc.toString()).toBe("#ff0000");
  });

  it("updates decorations when the document changes", () => {
    const v = makeView("plain text");
    expect(swatches(v)).toHaveLength(0);
    v.dispatch({ changes: { from: 0, to: 0, insert: "#123456 " } });
    expect(swatches(v)).toHaveLength(1);
  });
});

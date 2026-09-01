// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseTheme, highlightStyle } from "./theme";

const palette = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));

vi.mock("../../../../terminalTheme", () => ({
  terminalPalette: () => palette.current,
}));

type Spec = { tag: unknown; color?: string; fontStyle?: string };

afterEach(() => {
  document.body.innerHTML = "";
});

describe("highlightStyle", () => {
  it("maps shell token styles to the terminal palette", () => {
    palette.current = {
      foreground: "#ffffff",
      magenta: "#ff00ff",
      green: "#00ff00",
      brightBlack: "#555555",
      yellow: "#ffff00",
      cyan: "#00ffff",
      blue: "#0000ff",
    };
    const specs = highlightStyle().specs as Spec[];
    const byTag = new Map(specs.map((s) => [s.tag, s]));
    expect(byTag.get(t.keyword)?.color).toBe("#ff00ff");
    expect(byTag.get(t.string)?.color).toBe("#00ff00");
    expect(byTag.get(t.comment)?.color).toBe("#555555");
    expect(byTag.get(t.comment)?.fontStyle).toBe("italic");
    expect(byTag.get(t.variableName)?.color).toBe("#ffffff");
    expect(byTag.get(t.operator)?.color).toBe("#555555");
  });

  it("falls back to the foreground color for missing palette slots", () => {
    palette.current = { foreground: "#abcdef" };
    const specs = highlightStyle().specs as Spec[];
    for (const spec of specs) {
      expect(spec.color).toBe("#abcdef");
    }
  });

  it("degrades to inherit without any palette", () => {
    palette.current = {};
    const specs = highlightStyle().specs as Spec[];
    expect(specs.every((s) => s.color === "inherit")).toBe(true);
  });
});

describe("baseTheme", () => {
  it("injects the font settings into the editor styles", () => {
    palette.current = { foreground: "#eeeeee", cursor: "#ff0000" };
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: "",
        extensions: [baseTheme("TestMono", 17)],
      }),
      parent,
    });
    const css = [...document.head.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toContain("17px");
    expect(css).toContain("TestMono");
    expect(css).toContain("#ff0000");
    view.destroy();
  });

  it("uses the foreground as the caret fallback", () => {
    palette.current = { foreground: "#123456" };
    const ext = baseTheme("Mono", 12);
    expect(ext).toBeDefined();
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      state: EditorState.create({ doc: "", extensions: [ext] }),
      parent,
    });
    const css = [...document.head.querySelectorAll("style")]
      .map((s) => s.textContent)
      .join("\n");
    expect(css).toContain("#123456");
    view.destroy();
  });
});

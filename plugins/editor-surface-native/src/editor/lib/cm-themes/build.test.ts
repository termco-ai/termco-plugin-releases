import { highlightingFor } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { build, type Palette } from "./build";
import * as themes from "./index";

const BASE: Palette = {
  mode: "dark",
  bg: "#000000",
  fg: "#ffffff",
  caret: "#ffffff",
  selection: "#333333",
  lineHighlight: "#111111",
  gutterFg: "#888888",
  comment: "#666666",
  keyword: "#ff0000",
  string: "#00ff00",
  number: "#0000ff",
  func: "#ffff00",
  variable: "#ff00ff",
  property: "#00ffff",
  type: "#aaaaaa",
  operator: "#bbbbbb",
  tag: "#cccccc",
  attr: "#dddddd",
  heading: "#eeeeee",
  link: "#123456",
  invalid: "#654321",
};

describe("build", () => {
  it("produces an extension with a working highlight style", () => {
    const state = EditorState.create({ extensions: build(BASE) });
    expect(highlightingFor(state, [t.keyword])).toBeTruthy();
    expect(highlightingFor(state, [t.comment])).toBeTruthy();
    expect(highlightingFor(state, [t.string])).toBeTruthy();
  });

  it("supports both light and dark modes", () => {
    expect(() =>
      EditorState.create({ extensions: build({ ...BASE, mode: "light" }) }),
    ).not.toThrow();
  });

  it("styles constants distinctly when a constant color is given", () => {
    const withConstant = EditorState.create({
      extensions: build({ ...BASE, constant: "#abcdef" }),
    });
    const withoutConstant = EditorState.create({
      extensions: build(BASE),
    });
    // With a dedicated constant color, bool and number map to different
    // classes; without it, bool falls back to the number color's class.
    expect(highlightingFor(withConstant, [t.bool])).not.toBe(
      highlightingFor(withConstant, [t.number]),
    );
    expect(highlightingFor(withoutConstant, [t.bool])).toBeTruthy();
  });

  it("accepts the boldKeyword flag", () => {
    expect(() =>
      EditorState.create({
        extensions: build({ ...BASE, boldKeyword: true }),
      }),
    ).not.toThrow();
  });
});

describe("cm-themes barrel", () => {
  it("every exported theme is a usable extension", () => {
    const entries = Object.entries(themes);
    expect(entries.length).toBeGreaterThanOrEqual(12);
    for (const [name, ext] of entries) {
      expect(ext, `theme ${name} is falsy`).toBeTruthy();
      const state = EditorState.create({ extensions: ext });
      expect(
        highlightingFor(state, [t.keyword]),
        `theme ${name} has no keyword highlight`,
      ).toBeTruthy();
    }
  });
});

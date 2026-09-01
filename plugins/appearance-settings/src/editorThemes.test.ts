import { describe, expect, it } from "vitest";
import { EDITOR_THEMES, editorThemesFor } from "./editorThemes";

describe("appearance editor themes", () => {
  it("preserves the complete editor theme catalog", () => {
    expect(EDITOR_THEMES).toHaveLength(22);
  });

  it("orders compatible themes before incompatible themes", () => {
    const themes = editorThemesFor("light");
    const firstDark = themes.findIndex((theme) => theme[2] === "dark");
    expect(themes.slice(0, firstDark).every((theme) => theme[2] === "light")).toBe(true);
  });
});

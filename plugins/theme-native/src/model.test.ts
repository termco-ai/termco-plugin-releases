import { describe, expect, it } from "vitest";
import type { ThemeDefinition } from "@termco/ui-theme-base";
import { BUILTIN_THEMES } from "./catalog";
import {
  createStarterTheme,
  normalizeCustomThemes,
  resolveEditorTheme,
  validateTheme,
} from "./model";

const EXPECTED = [
  "termco-default", "claude", "kanagawa", "kanagawa-dragon", "tokyo-night",
  "catppuccin", "rose-pine", "everforest", "nord", "gruvbox", "dracula",
  "solarized", "tide", "sage", "caffeine",
];

describe("application theme model", () => {
  it("owns the exact complete built-in catalog", () => {
    expect(BUILTIN_THEMES.map((theme) => theme.id)).toEqual(EXPECTED);
    expect(new Set(EXPECTED).size).toBe(EXPECTED.length);
    for (const theme of BUILTIN_THEMES) expect(validateTheme(theme)).toMatchObject({ ok: true });
  });

  it("resolves explicit, mapped, cross-mode, and fallback editor themes", () => {
    expect(resolveEditorTheme("nord", "kanagawa", BUILTIN_THEMES, "light")).toBe("nord");
    expect(resolveEditorTheme("auto", "kanagawa", BUILTIN_THEMES, "dark")).toBe("kanagawa");
    expect(resolveEditorTheme("auto", "kanagawa", BUILTIN_THEMES, "light")).toBe("kanagawa-lotus");
    expect(resolveEditorTheme("auto", "kanagawa-dragon", BUILTIN_THEMES, "light")).toBe("kanagawa-dragon");
    expect(resolveEditorTheme("auto", "missing", [], "light")).toBe("atomone");
  });

  it("preserves custom, one-sided, and invalid editor-theme fallback behavior", () => {
    const custom: ThemeDefinition = {
      id: "company-theme",
      name: "Company",
      editorTheme: { dark: "dracula", light: "github-light" },
      variants: { dark: {}, light: {} },
    };
    const lightOnly: ThemeDefinition = {
      id: "light-only",
      name: "Light Only",
      editorTheme: { light: "github-light" },
      variants: { light: {} },
    };
    const invalid: ThemeDefinition = {
      id: "invalid-mapping",
      name: "Invalid Mapping",
      editorTheme: { dark: "not-a-real-editor-theme" },
      variants: { dark: {} },
    };

    expect(resolveEditorTheme("auto", custom.id, [custom], "dark")).toBe("dracula");
    expect(resolveEditorTheme("auto", custom.id, [custom], "light")).toBe("github-light");
    expect(resolveEditorTheme("auto", lightOnly.id, [lightOnly], "dark")).toBe("github-light");
    expect(resolveEditorTheme("auto", invalid.id, [invalid], "dark")).toBe("atomone");
    expect(resolveEditorTheme("auto", invalid.id, [invalid], "light")).toBe("github-light");
  });

  it("validates every nested custom-theme boundary", () => {
    expect(validateTheme({ id: "company-theme", name: "Company", variants: { dark: { colors: { primary: "#123456" } } } })).toMatchObject({ ok: true });
    expect(validateTheme({ id: "bad id", name: "Bad", variants: {} })).toMatchObject({ ok: false });
    expect(validateTheme({ id: "bad-colors", name: "Bad", variants: { dark: { colors: { surprise: "red" } } } })).toMatchObject({ ok: false });
    expect(validateTheme({ id: "bad-ansi", name: "Bad", variants: { dark: { terminal: { ansi: ["#000"] } } } })).toMatchObject({ ok: false });
  });

  it("normalizes stored values without retaining malformed entries", () => {
    const valid = { id: "company-theme", name: "Company", variants: { dark: {} } };
    expect(normalizeCustomThemes([valid, null, { id: "bad" }])).toEqual([valid]);
    expect(normalizeCustomThemes({ themes: [valid] })).toEqual([]);
  });

  it("creates unique valid starter themes", () => {
    const first = createStarterTheme();
    const second = createStarterTheme();
    expect(first.id).not.toBe(second.id);
    expect(first.name).toBe("My Theme");
    expect(validateTheme(first)).toMatchObject({ ok: true });
  });
});

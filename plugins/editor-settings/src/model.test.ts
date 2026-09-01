import { describe, expect, it } from "vitest";
import { clampAutoSaveDelay, resolveEditorPreferences } from "./model";

describe("editor preference model", () => {
  it("applies feature-owned defaults to absent or malformed storage", () => {
    expect(resolveEditorPreferences({ vimMode: "yes", editorAutoSaveDelay: null }))
      .toEqual({
        vimMode: false,
        editorWordWrap: false,
        editorFormatOnSave: true,
        editorAutoSave: false,
        editorAutoSaveDelay: 1000,
      });
  });

  it("clamps auto-save delay to the supported interval", () => {
    expect(clampAutoSaveDelay(1)).toBe(100);
    expect(clampAutoSaveDelay(1234.6)).toBe(1235);
    expect(clampAutoSaveDelay(90_000)).toBe(60_000);
  });
});

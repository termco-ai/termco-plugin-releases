import { describe, expect, it } from "vitest";
import { isThemeFilePath, joinPath, themeFilePath } from "./path";

describe("theme file paths", () => {
  it("builds native paths without duplicate separators", () => {
    expect(themeFilePath("/tmp/app/", "/", "night")).toBe("/tmp/app/themes/night.termco-theme");
    expect(joinPath("\\", "C:\\App\\", "themes", "night.termco-theme")).toBe("C:\\App\\themes\\night.termco-theme");
  });

  it("recognizes theme files case-insensitively", () => {
    expect(isThemeFilePath("Night.TERMCO-THEME")).toBe(true);
    expect(isThemeFilePath("Night.json")).toBe(false);
  });
});

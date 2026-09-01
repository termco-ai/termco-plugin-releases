// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, clearTheme } from "./apply";

afterEach(() => {
  clearTheme();
  document.documentElement.className = "";
});

describe("theme DOM application", () => {
  it("applies mode, color, terminal, and ANSI variables then cleans them up", () => {
    applyTheme({
      id: "test", name: "Test", variants: { dark: {
        colors: { background: "#101010", primary: "#abcdef" },
        terminal: { foreground: "#eeeeee", ansi: Array.from({ length: 16 }, (_, index) => `#0000${index.toString(16).padStart(2, "0")}`) },
      } },
    }, "dark");
    const root = document.documentElement;
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.getPropertyValue("--background")).toBe("#101010");
    expect(root.style.getPropertyValue("--terminal-foreground")).toBe("#eeeeee");
    expect(root.style.getPropertyValue("--terminal-ansi-black")).not.toBe("");
    clearTheme();
    expect(root.style.getPropertyValue("--background")).toBe("");
    expect(root.style.getPropertyValue("--terminal-foreground")).toBe("");
  });
});

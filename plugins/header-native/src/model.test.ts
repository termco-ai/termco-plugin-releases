import { describe, expect, it } from "vitest";
import { activityBadge, matchingTabs, shortcutLabel, tabGlyph } from "./model";

describe("default header behavior", () => {
  it("counts waiting sessions and unread completed notifications once", () => {
    const sessions = [{ status: "waiting" }, { status: "working" }] as unknown as Parameters<typeof activityBadge>[0];
    const notifications = [
      { read: false, kind: "attention" },
      { read: false, kind: "finished" },
      { read: true, kind: "error" },
    ] as unknown as Parameters<typeof activityBadge>[1];
    expect(activityBadge(sessions, notifications)).toBe(2);
  });

  it("owns tab presentation and filtering", () => {
    const tabs = [
      { kind: "terminal", label: "server", title: "Terminal", private: false },
      { kind: "editor", label: "README.md", title: "README.md", private: false },
    ] as unknown as Parameters<typeof matchingTabs>[0];
    expect(tabGlyph(tabs[0])).toBe(">_");
    expect(matchingTabs(tabs, "readme")).toEqual([tabs[1]]);
  });

  it("formats platform shortcut separators", () => {
    const shortcuts = {
      bindings: () => [{ ctrl: true, key: "k" }],
      format: () => ["Ctrl", "K"],
    } as unknown as Parameters<typeof shortcutLabel>[0];
    expect(shortcutLabel(shortcuts, "search.focus", "windows")).toBe("Ctrl K");
    expect(shortcutLabel(shortcuts, "search.focus", "macos")).toBe("Ctrl K");
  });
});

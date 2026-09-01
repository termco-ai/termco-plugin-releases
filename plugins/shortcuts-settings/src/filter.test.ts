import { describe, expect, it } from "vitest";
import { filterShortcuts } from "./filter";

describe("shortcut settings search", () => {
  it("searches labels, groups, descriptions, and ids while hiding the internal tab-index entry", () => {
    const shortcuts = [
      { id: "tab.new", label: "New tab", description: "Open workspace", group: "Tabs", defaultBindings: [] },
      { id: "editor.undo", label: "Undo", group: "Editor", defaultBindings: [], configurable: false },
      { id: "tab.selectByIndex", label: "Internal", group: "Tabs", defaultBindings: [], configurable: false },
    ];
    expect(filterShortcuts(shortcuts, "workspace").map((item) => item.id)).toEqual(["tab.new"]);
    expect(filterShortcuts(shortcuts, "undo").map((item) => item.id)).toEqual(["editor.undo"]);
    expect(filterShortcuts(shortcuts, "internal")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { PaletteItem } from "../types";
import { rankCommands } from "./rankCommands";

function item(id: string, title: string, keywords?: string[]): PaletteItem {
  return { id, title, group: "General", keywords, run: () => {} };
}

describe("rankCommands", () => {
  it("uses MRU recency when product order is equal", () => {
    const items = [item("a", "Alpha"), item("b", "Beta"), item("c", "Gamma")];
    const ranked = rankCommands(items, "", { b: 30, c: 20, a: 10 });
    expect(ranked.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("preserves explicit product order ahead of MRU", () => {
    const first = item("first", "First");
    first.order = 0;
    const last = item("last", "Last");
    last.order = 100;
    const ranked = rankCommands([last, first], "", { last: 99, first: 1 });
    expect(ranked.map((i) => i.id)).toEqual(["first", "last"]);
  });

  it("does not mutate the input array", () => {
    const items = [item("a", "Alpha"), item("b", "Beta")];
    rankCommands(items, "", { b: 2, a: 1 });
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("drops non-matching items when a term is given", () => {
    const items = [item("a", "Open settings"), item("b", "Close tab")];
    const ranked = rankCommands(items, "settings", {});
    expect(ranked.map((i) => i.id)).toEqual(["a"]);
  });

  it("matches on keywords too", () => {
    const items = [
      item("a", "Open settings", ["preferences"]),
      item("b", "Close tab"),
    ];
    const ranked = rankCommands(items, "preferences", {});
    expect(ranked.map((i) => i.id)).toEqual(["a"]);
  });

  it("matches natural-language terms across explanations and keywords", () => {
    const command = item("history", "Search command history", ["shell"]);
    command.description = "Find and insert a previous command into the active terminal.";
    const ranked = rankCommands(
      [command, item("settings", "Open settings")],
      "previous shell command",
      {},
    );
    expect(ranked.map((i) => i.id)).toEqual(["history"]);
  });

  it("orders matches by fuzzy score", () => {
    const items = [item("weak", "txhxexmxex", []), item("strong", "theme", [])];
    const ranked = rankCommands(items, "theme", {});
    expect(ranked[0].id).toBe("strong");
  });

  it("breaks score ties by MRU recency", () => {
    const items = [item("a", "New terminal"), item("b", "New terminal")];
    const ranked = rankCommands(items, "new terminal", { b: 99, a: 1 });
    expect(ranked.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(rankCommands([item("a", "Alpha")], "zzz", {})).toEqual([]);
  });
});

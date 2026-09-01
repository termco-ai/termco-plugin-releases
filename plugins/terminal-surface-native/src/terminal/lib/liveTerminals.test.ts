// Kept with the source-owning terminal plugin.
import type { Tab } from "../../tabTypes";
import { describe, expect, it } from "vitest";
import { selectLiveTerminals } from "./liveTerminals";

function term(id: number, over: Partial<Tab> = {}): Tab {
  return {
    id,
    kind: "terminal",
    rigId: "s1",
    title: "shell",
    paneTree: { kind: "leaf", id: id * 10 },
    activeLeafId: id * 10,
    ...over,
  } as Tab;
}

describe("selectLiveTerminals", () => {
  it("excludes cold terminals so they never mount or spawn", () => {
    const tabs: Tab[] = [
      term(1, { cold: true }),
      term(2),
      term(3, { cold: true }),
      term(4, { cold: true }),
    ];
    const live = selectLiveTerminals(tabs);
    expect(live.map((t) => t.id)).toEqual([2]);
  });

  it("keeps warm terminals across rigs and ignores non-terminal kinds", () => {
    const tabs: Tab[] = [
      term(1, { rigId: "a" }),
      term(2, { rigId: "b" }),
      {
        id: 3,
        kind: "editor",
        rigId: "a",
        title: "x",
      },
    ];
    expect(selectLiveTerminals(tabs).map((t) => t.id)).toEqual([1, 2]);
  });
});

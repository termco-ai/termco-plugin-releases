import { describe, expect, it } from "vitest";
import { leafIds } from "./terminal/lib/panes";

describe("terminal surface ownership", () => {
  it("owns the pane-tree behavior used by its renderer", () => {
    expect(leafIds({
      kind: "split",
      id: 10,
      dir: "row",
      children: [
        { kind: "leaf", id: 1 },
        { kind: "leaf", id: 2, cwd: "/repo" },
      ],
    })).toEqual([1, 2]);
  });
});

import { describe, expect, it } from "vitest";
import { isSerializableTab, serializeTabs, type WorkspaceTab } from "./workspaceSerialization";

describe("workspace serialization", () => {
  it("excludes live plugin surfaces that opt out of restart restore", () => {
    const review = {
      id: 1,
      rigId: "local",
      kind: "plugin:forge-review",
      title: "MR #42",
      restoreOnRestart: false,
      data: { number: 42 },
    } satisfies WorkspaceTab;

    expect(isSerializableTab(review)).toBe(false);
    expect(serializeTabs([review])).toEqual([]);
  });
});

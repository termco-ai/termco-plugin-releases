import { describe, expect, it } from "vitest";
import { createAiRegistries } from "./registry";

describe("AI registry provider", () => {
  it("keeps tools and toolsets registered independently of Chat presentation", async () => {
    const { tools, toolsets } = createAiRegistries();
    tools.register({
      id: "test-tool",
      group: "test",
      build: () => ({}),
    });
    toolsets.register({
      id: "test-toolset",
      group: "test",
      build: () => ({}),
    });
    expect(tools.snapshot().map((entry) => entry.id)).toEqual(["test-tool"]);
    expect(toolsets.snapshot().map((entry) => entry.id)).toEqual([
      "test-toolset",
    ]);

    // There is deliberately no Chat/presentation input to this provider.
    expect(tools.snapshot().map((entry) => entry.id)).toEqual(["test-tool"]);
  });

  it("owns exact registration disposal and restores stable ordering", async () => {
    const { tools } = createAiRegistries();
    const changes: string[][] = [];
    const offChanges = tools.subscribe(() => {
      changes.push(tools.snapshot().map((entry) => entry.id));
    });
    const offLater = tools.register({
      id: "later",
      group: "test",
      order: 20,
      build: () => ({}),
    });
    tools.register({
      id: "first",
      group: "test",
      order: 10,
      build: () => ({}),
    });
    expect(tools.snapshot().map((entry) => entry.id)).toEqual([
      "first",
      "later",
    ]);
    offLater();
    offLater();
    offChanges();
    expect(tools.snapshot().map((entry) => entry.id)).toEqual(["first"]);
    expect(changes).toEqual([
      ["later"],
      ["first", "later"],
      ["first"],
    ]);
  });
});

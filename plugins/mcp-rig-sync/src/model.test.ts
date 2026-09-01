import { describe, expect, it } from "vitest";
import { mcpRigs } from "./model";

describe("mcp workspace mirror", () => {
  it("publishes only rigs that can anchor a working directory", () => {
    expect(mcpRigs([
      { id: "local", name: "Local", root: "/repo", workspace: { kind: "local" } },
      { id: "empty", name: "Empty", root: null, workspace: { kind: "local" } },
    ])).toEqual([{ id: "local", name: "Local", root: "/repo" }]);
  });
});

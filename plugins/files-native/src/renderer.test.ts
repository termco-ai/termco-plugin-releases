import { bindProcessTransport, type CapabilityTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererFilesCapability } from "./renderer";

describe("renderer files bridge", () => {
  it("preserves watchAdd/watchRemove results and provider errors", async () => {
    const call = vi.fn<CapabilityTransport>(async ({ method }) => {
      if (method === "watchAdd") return undefined;
      if (method === "watchRemove") throw new Error("watch removal failed");
    });
    const files = createRendererFilesCapability(
      bindProcessTransport("files-native", call),
    );
    await expect(files.watchAdd([], { kind: "local" })).resolves.toBeUndefined();
    await expect(files.watchRemove([], { kind: "local" })).rejects.toThrow(
      "watch removal failed",
    );
  });
});

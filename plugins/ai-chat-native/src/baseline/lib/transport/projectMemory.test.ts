import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureNativeFiles } from "../native/native";
import { clearProjectMemoryCache, readProjectMemory } from "./projectMemory";

let dispose = () => {};

afterEach(() => {
  dispose();
  dispose = () => {};
  clearProjectMemoryCache();
});

describe("chat project memory", () => {
  it("loads, deduplicates, and labels repository instruction files through workspace.files", async () => {
    const readFile = vi.fn(async (path: string) => {
      if (path.endsWith("AGENTS.md")) {
        return { kind: "text", content: "Agent rules", size: 11 };
      }
      if (path.endsWith("CLAUDE.md")) {
        return { kind: "text", content: "Agent rules", size: 11 };
      }
      return { kind: "text", content: "Termco rules", size: 12 };
    });
    dispose = configureNativeFiles(
      { readFile } as unknown as WorkspaceFilesCapability,
      {
        snapshot: () => ({
          hydrated: true,
          activeId: "local",
          rigs: [{ id: "local", workspace: { kind: "local" } }],
        }),
      } as unknown as WorkspaceRigsCapability,
    );

    await expect(readProjectMemory("/repo/")).resolves.toBe(
      "### AGENTS.md\nAgent rules\n\n### TERMCO.md\nTermco rules",
    );
    expect(readFile).toHaveBeenCalledTimes(3);
    expect(readFile).toHaveBeenCalledWith(
      "/repo/AGENTS.md",
      { kind: "local" },
      true,
    );
  });

  it("ignores missing roots instead of probing the filesystem root", async () => {
    await expect(readProjectMemory(null)).resolves.toBeNull();
    await expect(readProjectMemory("/")).resolves.toBeNull();
  });
});

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

    await expect(readProjectMemory("/repo/", { kind: "local" })).resolves.toBe(
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
    await expect(readProjectMemory(null, { kind: "local" })).resolves.toBeNull();
    await expect(readProjectMemory("/", { kind: "local" })).resolves.toBeNull();
  });
});

it("isolates identical paths across rigs and reads background sessions on their bound host", async () => {
  const alpha = { kind: "ssh", connectionId: "alpha", host: "alpha.example" } as const;
  const beta = { kind: "ssh", connectionId: "beta", host: "beta.example" } as const;
  const readFile = vi.fn(async (_path, workspace) => ({ kind: "text", content: `${workspace.connectionId} instructions` }));
  dispose = configureNativeFiles({ readFile } as unknown as WorkspaceFilesCapability, {
    snapshot: () => ({ activeId: "beta", rigs: [{ id: "beta", workspace: beta }] }),
  } as unknown as WorkspaceRigsCapability);
  await expect(readProjectMemory("/workspace/app", alpha)).resolves.toBe("alpha instructions");
  await expect(readProjectMemory("/workspace/app", beta)).resolves.toBe("beta instructions");
  await expect(readProjectMemory("/workspace/app/", alpha)).resolves.toBe("alpha instructions");
  expect(readFile).toHaveBeenCalledTimes(6);
});

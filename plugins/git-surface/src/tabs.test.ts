import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import { describe, expect, it, vi } from "vitest";
import { toGitTab, toGitTabs } from "./tabs";

const remote = {
  kind: "ssh" as const,
  connectionId: "rig-b-connection",
  host: "server-b",
};
const runtime = {
  workspaceForRig: vi.fn((rigId: string) =>
    rigId === "rig-b" ? remote : { kind: "local" as const },
  ),
} satisfies Pick<UiTabsRuntime, "workspaceForRig">;

function descriptor(
  patch: Partial<UiTabDescriptor> = {},
): UiTabDescriptor {
  return {
    id: 1,
    rigId: "rig-b",
    kind: "git-diff",
    title: "file.ts (-)",
    cold: false,
    path: "src/file.ts",
    data: { repoRoot: "/remote/repo", mode: "-", originalPath: null },
    ...patch,
  };
}

describe("Git surface tab adaptation", () => {
  it("binds every Git operation to the tab's rig, not the first rig", () => {
    expect(toGitTab(descriptor(), runtime)).toMatchObject({
      rigId: "rig-b",
      repoRoot: "/remote/repo",
      workspace: remote,
    });
    expect(runtime.workspaceForRig).toHaveBeenCalledWith("rig-b");
  });

  it("keeps commit-file metadata and selected rig together", () => {
    expect(
      toGitTab(
        descriptor({
          kind: "git-commit-file",
          path: "src/changed.ts",
          data: {
            repoRoot: "/remote/repo",
            sha: "abcdef1234567890",
            shortSha: "abcdef1",
            subject: "Change it",
            originalPath: "src/old.ts",
          },
        }),
        runtime,
      ),
    ).toMatchObject({
      kind: "git-commit-file",
      workspace: remote,
      originalPath: "src/old.ts",
    });
  });

  it("does not activate restored cold tabs", () => {
    expect(toGitTabs([descriptor({ cold: true })], runtime)).toEqual([]);
  });
});

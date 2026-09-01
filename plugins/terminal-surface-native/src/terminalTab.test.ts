import type { UiTabDescriptor, UiTabsRuntime } from "@termco/ui-tabs-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { toTerminalTab } from "./terminalTab";

function descriptor(id: number, rigId: string): UiTabDescriptor {
  return {
    id,
    rigId,
    kind: "terminal",
    title: `Terminal ${id}`,
    cold: false,
    data: {
      paneTree: { kind: "leaf", id: id * 10 },
      activeLeafId: id * 10,
    },
  };
}

describe("terminal rig workspace ownership", () => {
  it("binds every mounted terminal tab to its own rig workspace", () => {
    const local: WorkspaceEnv = { kind: "local" };
    const ssh: WorkspaceEnv = {
      kind: "ssh",
      connectionId: "opendoc-v2",
      host: "opendoc-v2",
    };
    const workspaceForRig = vi.fn((rigId: string) =>
      rigId === "local-rig" ? local : ssh,
    );
    const runtime = { workspaceForRig } as Pick<UiTabsRuntime, "workspaceForRig">;

    expect(toTerminalTab(descriptor(1, "ssh-rig"), runtime)?.workspace).toBe(ssh);
    expect(toTerminalTab(descriptor(2, "local-rig"), runtime)?.workspace).toBe(local);
    expect(workspaceForRig.mock.calls).toEqual([["ssh-rig"], ["local-rig"]]);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import { installWorkspaceRigsE2E } from "./plugin";

describe("workspace rigs E2E seam", () => {
  it("drives the real rig capability and removes only its own hooks", () => {
    interface WorkspaceRigsE2ESeam {
      kept: boolean;
      rigCreateLocal(name: string, root: string): string;
      rigCreateSsh(name: string, root: string): string;
      rigSetActive(id: string): void;
      envGet(): unknown;
    }
    const rigs = {
      create: vi.fn((input) => ({ id: `rig-${input.name}`, ...input })),
      activate: vi.fn(),
      snapshot: vi.fn(() => ({
        hydrated: true,
        activeId: "rig-local",
        rigs: [{ id: "rig-local", workspace: { kind: "local" } }],
      })),
    } as unknown as WorkspaceRigsCapability;
    const host = { __termco: { e2e: true }, __termcoE2E: { kept: true } };
    const dispose = installWorkspaceRigsE2E(host, rigs);
    const seam = host.__termcoE2E as unknown as WorkspaceRigsE2ESeam;

    expect(seam.rigCreateLocal("local", "/repo")).toBe("rig-local");
    expect(seam.rigCreateSsh("server", "/srv")).toBe("rig-server");
    seam.rigSetActive("rig-server");
    expect(rigs.create).toHaveBeenNthCalledWith(2, {
      name: "server",
      root: "/srv",
      workspace: { kind: "ssh", connectionId: "server", host: "server" },
    });
    expect(rigs.activate).toHaveBeenCalledWith("rig-server");
    expect(seam.envGet()).toEqual({ kind: "local" });

    dispose();
    expect(host.__termcoE2E).toEqual({ kept: true });
  });
});

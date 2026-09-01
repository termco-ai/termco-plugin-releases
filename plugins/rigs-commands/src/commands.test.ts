import { describe, expect, it, vi } from "vitest";
import type {
  WorkspaceRigOverviewCapability,
  WorkspaceRigWorkflowsCapability,
  WorkspaceRigsCapability,
} from "@termco/workspace-base";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";
import { rigCommands } from "./commands";

describe("rig commands", () => {
  const overview = () =>
    ({ setOpen: vi.fn() }) as unknown as WorkspaceRigOverviewCapability;
  const workflows = () =>
    ({ createLocal: vi.fn() }) as unknown as WorkspaceRigWorkflowsCapability;

  it("collects live rig switch commands and marks the active rig", () => {
    const workspaceRigs = {
      snapshot: () => ({
        hydrated: true,
        activeId: "one",
        rigs: [
        { id: "one", name: "One", root: "/one", workspaceKind: "local" },
        { id: "two", name: "Two", root: "/two", workspaceKind: "local" },
        ],
      }),
    } as unknown as WorkspaceRigsCapability;
    const commands = rigCommands(workspaceRigs, overview(), workflows());
    expect(commands.map((command) => command.title)).toContain("Switch to Two");
    expect(commands.find((command) => command.id === "rigs.switch.one")?.disabledReason).toBe("Current rig");
    expect(commands.every((command) => command.icon === DashboardSquare01Icon)).toBe(true);
  });

  it("opens the selected source-owned rig overview", () => {
    const rigOverview = overview();
    const workspaceRigs = {
      snapshot: () => ({ rigs: [], activeId: null }),
    } as unknown as WorkspaceRigsCapability;
    rigCommands(workspaceRigs, rigOverview, workflows())[0]?.run({} as never);
    expect(rigOverview.setOpen).toHaveBeenCalledWith(true);
  });

  it("creates rigs through the shared rig workflow provider", () => {
    const workspaceRigs = {
      snapshot: () => ({ rigs: [], activeId: null }),
    } as unknown as WorkspaceRigsCapability;
    const rigWorkflows = workflows();

    rigCommands(workspaceRigs, overview(), rigWorkflows)
      .find((command) => command.id === "rigs.new")
      ?.run({} as never);

    expect(rigWorkflows.createLocal).toHaveBeenCalledOnce();
  });

  it("keeps overview ahead of creation even after creation becomes recent", () => {
    const workspaceRigs = {
      snapshot: () => ({ rigs: [], activeId: null }),
    } as unknown as WorkspaceRigsCapability;
    const commands = rigCommands(workspaceRigs, overview(), workflows());

    expect(commands.find((command) => command.id === "rigs.overview")?.order).toBe(0);
    expect(commands.find((command) => command.id === "rigs.new")?.order).toBe(100);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { UiSidebarNavigationCapability } from "@termco/ui-sidebar-base";
import type {
  WorkspaceRigsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import {
  bindExternalStore,
  createCommandRuntime,
  focusedTerminalLeaf,
} from "./renderer";

describe("command palette runtime", () => {
  it("routes commands through the selected shared providers", () => {
    const show = vi.fn();
    const cycle = vi.fn();
    const activate = vi.fn();
    const runtime = createCommandRuntime(
      { show } as unknown as UiSidebarNavigationCapability,
      {
        snapshot: () => ({
          hydrated: true,
          activeId: "remote",
          rigs: [
            {
              id: "remote",
              name: "Remote",
              root: "/srv/app",
              workspace: { kind: "ssh", connectionId: "ssh-1" },
              color: 4,
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }),
        cycle,
        activate,
      } as unknown as WorkspaceRigsCapability,
    );

    runtime.showSidebarView("source-control");
    runtime.cycleRig(-1);
    runtime.activateRig("remote");

    expect(show).toHaveBeenCalledWith("source-control");
    expect(cycle).toHaveBeenCalledWith(-1);
    expect(activate).toHaveBeenCalledWith("remote");
    expect(runtime.activeRigId()).toBe("remote");
    expect(runtime.rigs()).toEqual([
      {
        id: "remote",
        name: "Remote",
        root: "/srv/app",
        workspaceKind: "ssh",
        color: 4,
      },
    ]);
  });

  it("uses the focused split pane's terminal leaf", () => {
    const snapshot = {
      revision: 1,
      initialized: true,
      booted: true,
      focusedPane: "right",
      splitTabId: 22,
      activeId: 11,
      activeRigIdForNewTabs: "remote",
      activeTabByRig: { local: 11, remote: 22 },
      tabs: [
        { id: 11, rigId: "local", kind: "editor", title: "a.ts" },
        {
          id: 22,
          rigId: "remote",
          kind: "terminal",
          title: "shell",
          data: { activeLeafId: 23 },
        },
      ],
    } satisfies WorkspaceTabsSnapshot;

    expect(focusedTerminalLeaf(snapshot)).toBe(23);
    expect(
      focusedTerminalLeaf({
        ...snapshot,
        focusedPane: "left",
      }),
    ).toBeNull();
  });

  it("preserves this for class-based providers passed to React", () => {
    class Store {
      #value = 7;

      subscribe(listener: () => void) {
        expect(this.#value).toBe(7);
        listener();
        return () => {};
      }

      snapshot() {
        return this.#value;
      }
    }

    const store = bindExternalStore(new Store());
    const listener = vi.fn();
    expect(store.snapshot()).toBe(7);
    store.subscribe(listener)();
    expect(listener).toHaveBeenCalledOnce();
  });
});

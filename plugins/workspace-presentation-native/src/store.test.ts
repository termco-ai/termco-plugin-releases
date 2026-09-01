import type { WorkspacePresentationState } from "@termco/workspace-base";
import { describe, expect, it, vi } from "vitest";
import { WorkspacePresentationStore } from "./store";

const state: WorkspacePresentationState = {
  header: {
    tabs: [
      {
        id: 2,
        rigId: "remote",
        kind: "terminal",
        label: "root",
        title: "root",
        dirty: false,
        preview: false,
        private: false,
      },
    ],
    allTabs: [],
    activeTabId: 2,
    agentsViewOpen: false,
    editorDirty: false,
    findTarget: null,
  },
  sidebar: {
    rootPath: "/srv/project",
    workspace: {
      kind: "ssh",
      connectionId: "remote",
      host: "server.example",
    },
    activeFilePath: "/srv/project/src/main.ts",
  },
  context: {
    cwd: "/srv/project",
    filePath: "/srv/project/src/main.ts",
    home: "/home/dev",
    privateActive: false,
    zenMode: true,
  },
};

describe("workspace presentation provider", () => {
  it("publishes one shared revisioned snapshot", () => {
    const store = new WorkspacePresentationStore();
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.snapshot()).toMatchObject({
      revision: 0,
      header: { tabs: [], allTabs: [], activeTabId: 0 },
      sidebar: { rootPath: null, workspace: { kind: "local" } },
      context: { cwd: null, filePath: null, zenMode: false },
    });

    store.publish(state);
    expect(store.snapshot()).toEqual({ revision: 1, ...state });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns an idempotent subscription disposer", () => {
    const store = new WorkspacePresentationStore();
    const listener = vi.fn();
    const dispose = store.subscribe(listener);
    dispose();
    dispose();
    store.publish(state);
    expect(listener).not.toHaveBeenCalled();
  });
});

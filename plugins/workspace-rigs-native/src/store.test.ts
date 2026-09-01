import { describe, expect, it, vi } from "vitest";
import type { PreferencesCapability } from "@termco/storage-base";
import type { WorkspaceRigsSnapshot } from "@termco/workspace-base";
import { WORKSPACE_RIGS_KEY, WorkspaceRigsStore } from "./store";

function preferences(initial?: WorkspaceRigsSnapshot) {
  let value: unknown = initial;
  const capability: PreferencesCapability = {
    get: vi.fn(async () => value) as PreferencesCapability["get"],
    getMany: vi.fn(async () => ({})),
    set: vi.fn(async (key, next) => {
      if (key === WORKSPACE_RIGS_KEY) value = next;
    }),
    delete: vi.fn(async () => false),
    subscribe: () => () => {},
  };
  return { capability, read: () => value };
}

describe("WorkspaceRigsStore", () => {
  it("hydrates empty and persists create, rename, and activation", async () => {
    const backing = preferences();
    const store = new WorkspaceRigsStore(backing.capability);
    await store.hydrate();

    expect(store.snapshot().rigs).toHaveLength(0);
    const rig = store.create({ id: "docs", name: "Docs", root: "/docs" });
    store.rename(rig.id, "Documentation");
    store.activate("docs");

    expect(store.snapshot()).toMatchObject({ activeId: "docs" });
    expect(store.snapshot().rigs[0]).toMatchObject({
      id: "docs",
      name: "Documentation",
      root: "/docs",
    });
    await vi.waitFor(() => expect(backing.read()).toEqual(store.snapshot()));
  });

  it("cycles across rigs and can remove the final rig", async () => {
    const backing = preferences();
    const store = new WorkspaceRigsStore(backing.capability);
    await store.hydrate();
    store.create({ id: "first" });
    store.create({ id: "second" });
    store.cycle(1);
    expect(store.snapshot().activeId).toBe("first");
    store.remove("second");
    store.remove("first");
    expect(store.snapshot()).toMatchObject({ rigs: [], activeId: null });
  });

  it("reorders known ids, appends omitted rigs, and ignores unknown ids", async () => {
    const backing = preferences();
    const store = new WorkspaceRigsStore(backing.capability);
    await store.hydrate();
    store.create({ id: "a" });
    store.create({ id: "b" });
    store.create({ id: "c" });

    store.reorder(["ghost", "b"]);

    expect(store.snapshot().rigs.map((rig) => rig.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    await vi.waitFor(() => expect(backing.read()).toEqual(store.snapshot()));
  });

  it("does not publish or persist when the requested rig is already active", async () => {
    const backing = preferences();
    const store = new WorkspaceRigsStore(backing.capability);
    await store.hydrate();
    store.create({ id: "active" });
    await vi.waitFor(() =>
      expect(backing.capability.set).toHaveBeenCalled(),
    );
    vi.mocked(backing.capability.set).mockClear();
    const listener = vi.fn();
    store.subscribe(listener);

    store.activate("active");

    expect(listener).not.toHaveBeenCalled();
    expect(backing.capability.set).not.toHaveBeenCalled();
  });

  it("updates only the requested workspace binding and color", async () => {
    const store = new WorkspaceRigsStore(preferences().capability);
    await store.hydrate();
    store.create({ id: "a", root: "/a" });
    store.create({ id: "b", root: "/b" });

    store.setWorkspace(
      "b",
      { kind: "wsl", distro: "Debian" },
      "/home/dev",
    );
    store.setColor("b", 3);

    expect(store.snapshot().rigs[0]).toMatchObject({
      id: "a",
      root: "/a",
      workspace: { kind: "local" },
    });
    expect(store.snapshot().rigs[1]).toMatchObject({
      id: "b",
      root: "/home/dev",
      workspace: { kind: "wsl", distro: "Debian" },
      color: 3,
    });

    store.setColor("b", undefined);
    expect(store.snapshot().rigs[1].color).toBeUndefined();
  });

  it("keeps a non-active rig selected and picks the first fallback for an active removal", async () => {
    const store = new WorkspaceRigsStore(preferences().capability);
    await store.hydrate();
    store.create({ id: "a" });
    store.create({ id: "b" });
    store.create({ id: "c" });
    store.activate("b");

    store.remove("c");
    expect(store.snapshot().activeId).toBe("b");
    store.remove("b");
    expect(store.snapshot()).toMatchObject({ activeId: "a" });
    expect(store.snapshot().rigs.map((rig) => rig.id)).toEqual(["a"]);
  });

  it("cycles forward and backward with wrapping", async () => {
    const store = new WorkspaceRigsStore(preferences().capability);
    await store.hydrate();
    store.create({ id: "a" });
    store.create({ id: "b" });
    store.create({ id: "c" });

    store.cycle(1);
    expect(store.snapshot().activeId).toBe("a");
    store.cycle(-1);
    expect(store.snapshot().activeId).toBe("c");
    store.cycle(-1);
    expect(store.snapshot().activeId).toBe("b");
  });

  it("normalizes a missing active rig to the first hydrated rig", async () => {
    const store = new WorkspaceRigsStore(
      preferences({
        hydrated: false,
        activeId: "missing",
        rigs: [
          {
            id: "a",
            name: "A",
            root: null,
            workspace: { kind: "local" },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      }).capability,
    );

    await store.hydrate();

    expect(store.snapshot()).toMatchObject({ hydrated: true, activeId: "a" });
  });

  it("stops notifying a subscriber after it unsubscribes", async () => {
    const store = new WorkspaceRigsStore(preferences().capability);
    await store.hydrate();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.create({ id: "a" });
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    store.rename("a", "A");
    expect(listener).toHaveBeenCalledOnce();
  });
});

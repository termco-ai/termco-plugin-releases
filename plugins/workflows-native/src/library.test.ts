import { describe, expect, it, vi } from "vitest";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { WorkflowDefinition } from "@termco/workflows-base";
import { BUILTIN_WORKFLOWS } from "./builtins";
import { createWorkflowsLibrary } from "./library";
import { createWorkflowDefinitionsRegistry } from "./registry";

function harness() {
  const values = new Map<string, unknown>();
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const preferences: PreferencesCapability = {
    get: async (key) => values.get(key) as never,
    getMany: async (keys) => Object.fromEntries(keys.flatMap((key) => values.has(key) ? [[key, values.get(key)]] : [])),
    set: vi.fn(async (key, value) => { values.set(key, value); }),
    delete: async (key) => values.delete(key),
    subscribe: () => () => {},
  };
  const events: ApplicationEventsCapability = {
    emit(event, payload) { for (const listener of listeners.get(event) ?? []) listener(payload); },
    subscribe(event, listener) { const set = listeners.get(event) ?? new Set(); set.add(listener); listeners.set(event, set); return () => set.delete(listener); },
    subscribeAll: () => () => {},
    listenerCount: (event) => listeners.get(event)?.size ?? 0,
  };
  return { preferences, events };
}

const user = (id: string): WorkflowDefinition => ({
  id,
  name: id,
  command: "echo hello",
  parameters: [],
  tags: ["custom"],
  target: { kind: "focused_terminal" },
  source: "user",
});

describe("workflows library capability", () => {
  it("combines built-ins, plugin contributions, and persisted user workflows", async () => {
    const h = harness();
    const definitions = createWorkflowDefinitionsRegistry();
    definitions.register({ id: "company", workflows: [user("company.deploy")] });
    const owned = await createWorkflowsLibrary(h.preferences, h.events, definitions);
    await owned.capability.upsert(user("mine"));
    const ids = owned.capability.all().map((entry) => entry.id);
    expect(ids[BuiltinCount()]).toBe("company.deploy");
    expect(ids.at(-1)).toBe("mine");
    expect(owned.capability.get("company.deploy")?.source).toBe("plugin");
    definitions.register({ id: "later", workflows: [user("later.deploy")] });
    expect(owned.capability.get("later.deploy")?.source).toBe("plugin");
    owned.dispose();
  });

  it("persists favourites and recent values through the shared provider", async () => {
    const h = harness();
    const owned = await createWorkflowsLibrary(
      h.preferences,
      h.events,
      createWorkflowDefinitionsRegistry(),
    );
    await owned.capability.toggleFavorite("git-status");
    await owned.capability.recordRun({ workflowId: "git-status", command: "git status -sb", values: { mode: "short" }, target: { kind: "focused_terminal" }, at: 1 });
    expect(owned.capability.isFavorite("git-status")).toBe(true);
    expect(owned.capability.lastValues("git-status")).toEqual({ mode: "short" });
    expect(h.preferences.set).toHaveBeenCalled();
    owned.dispose();
  });
});

function BuiltinCount(): number {
  return BUILTIN_WORKFLOWS.length;
}

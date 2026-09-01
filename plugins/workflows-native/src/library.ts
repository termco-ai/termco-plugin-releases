import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type {
  WorkflowDefinition,
  WorkflowDefinitionsRegistry,
  WorkflowRun,
  WorkflowRunnerRegistry,
  WorkflowsLibraryCapability,
  WorkflowsSnapshot,
  WorkflowValues,
} from "@termco/workflows-base";
import { BUILTIN_WORKFLOWS } from "./builtins";
import {
  extractPlaceholders,
  missingRequired,
  newWorkflowId,
  renderSteps,
} from "./domain";

export const USER_KEY = "workflows.user";
export const FAVORITES_KEY = "workflows.favorites";
export const RECENT_KEY = "workflows.recent";
export const CHANGED_EVENT = "termco://workflows-native-changed";
const RECENT_LIMIT = 100;

function array<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function createWorkflowsLibrary(
  preferences: PreferencesCapability | null,
  events: ApplicationEventsCapability | null,
  contributions: WorkflowDefinitionsRegistry,
  runners?: WorkflowRunnerRegistry,
  includeBuiltins = true,
): Promise<{
  capability: WorkflowsLibraryCapability;
  bindPersistence(
    preferences: PreferencesCapability,
    events: ApplicationEventsCapability,
  ): Promise<() => void>;
  dispose(): void;
}> {
  const instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const contributed = (): readonly WorkflowDefinition[] =>
    contributions.snapshot().flatMap((entry) =>
      entry.workflows.map((workflow) => ({
        ...workflow,
        source: "plugin" as const,
      })),
    );
  const listeners = new Set<() => void>();
  let userWorkflows: WorkflowDefinition[] = [];
  let favoriteIds: string[] = [];
  let recent: WorkflowRun[] = [];
  let hydrated = false;
  let snapshot: WorkflowsSnapshot;
  let activePreferences = preferences;
  let activeEvents = events;
  let unsubscribeEvent = () => {};

  const all = (): readonly WorkflowDefinition[] => [
    ...(includeBuiltins ? BUILTIN_WORKFLOWS : []),
    ...contributed(),
    ...userWorkflows,
  ];
  const rebuild = () => {
    snapshot = {
      hydrated,
      workflows: all(),
      userWorkflows,
      favoriteIds,
      recent,
    };
  };
  const publish = () => {
    rebuild();
    for (const listener of listeners) listener();
  };
  const load = async (notify: boolean) => {
    if (!activePreferences) {
      hydrated = true;
      if (notify) publish();
      else rebuild();
      return;
    }
    const stored = await activePreferences.getMany([USER_KEY, FAVORITES_KEY, RECENT_KEY]);
    userWorkflows = array<WorkflowDefinition>(stored[USER_KEY]).filter(
      (workflow) => workflow && typeof workflow.id === "string",
    );
    favoriteIds = array<string>(stored[FAVORITES_KEY]).filter(
      (id) => typeof id === "string",
    );
    recent = array<WorkflowRun>(stored[RECENT_KEY]).slice(0, RECENT_LIMIT);
    hydrated = true;
    if (notify) publish();
    else rebuild();
  };
  const persist = async (key: string, value: unknown) => {
    if (!activePreferences || !activeEvents) return;
    await activePreferences.set(key, value);
    activeEvents.emit(CHANGED_EVENT, { instance });
  };

  await load(false);
  const subscribePersistenceEvents = () => {
    unsubscribeEvent();
    unsubscribeEvent = activeEvents?.subscribe(CHANGED_EVENT, (payload) => {
      if (
        payload &&
        typeof payload === "object" &&
        (payload as { instance?: string }).instance === instance
      ) {
        return;
      }
      void load(true);
    }) ?? (() => {});
  };
  subscribePersistenceEvents();
  const unsubscribeContributions = contributions.subscribe(publish);
  const unsubscribeRunners = runners?.subscribe(publish) ?? (() => {});

  const capability: WorkflowsLibraryCapability = {
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    all,
    visible(rigId) {
      return all().filter(
        (workflow) => workflow.source !== "rig" || workflow.rigId === rigId,
      );
    },
    get(id) {
      return all().find((workflow) => workflow.id === id);
    },
    isFavorite(id) {
      return favoriteIds.includes(id);
    },
    lastValues(id): WorkflowValues | undefined {
      return recent.find((run) => run.workflowId === id)?.values;
    },
    newId: newWorkflowId,
    extractPlaceholders,
    renderSteps,
    missingRequired,
    availability(workflow) {
      const runner = runners?.resolve(workflow.target);
      return runner
        ? { available: true }
        : {
            available: false,
            reason: `No ${workflow.target.kind.replaceAll("_", " ")} runner is available.`,
          };
    },
    async run(workflow, values, target = workflow.target) {
      const command = renderSteps(workflow, values)
        .filter((part) => part.trim())
        .join(" && ");
      if (!command) return { ok: false, error: "Nothing to run." };
      const runner = runners?.resolve(target);
      if (!runner) {
        return {
          ok: false,
          unavailable: true,
          error: `No ${target.kind.replaceAll("_", " ")} runner is available.`,
        };
      }
      return runner.run({ workflow, values, target, command });
    },
    async upsert(workflow) {
      if (workflow.source === "builtin" || workflow.source === "plugin") return;
      const index = userWorkflows.findIndex((entry) => entry.id === workflow.id);
      userWorkflows =
        index < 0
          ? [...userWorkflows, workflow]
          : userWorkflows.map((entry) =>
              entry.id === workflow.id ? workflow : entry,
            );
      publish();
      await persist(USER_KEY, userWorkflows);
    },
    async remove(id) {
      userWorkflows = userWorkflows.filter((workflow) => workflow.id !== id);
      const nextFavorites = favoriteIds.filter((favorite) => favorite !== id);
      const favoritesChanged = nextFavorites.length !== favoriteIds.length;
      favoriteIds = nextFavorites;
      publish();
      await activePreferences?.set(USER_KEY, userWorkflows);
      if (favoritesChanged) {
        await activePreferences?.set(FAVORITES_KEY, favoriteIds);
      }
      activeEvents?.emit(CHANGED_EVENT, { instance });
    },
    async toggleFavorite(id) {
      favoriteIds = favoriteIds.includes(id)
        ? favoriteIds.filter((favorite) => favorite !== id)
        : [...favoriteIds, id];
      publish();
      await persist(FAVORITES_KEY, favoriteIds);
    },
    async recordRun(run) {
      recent = [run, ...recent].slice(0, RECENT_LIMIT);
      publish();
      await persist(RECENT_KEY, recent);
    },
  };

  return {
    capability,
    async bindPersistence(nextPreferences, nextEvents) {
      activePreferences = nextPreferences;
      activeEvents = nextEvents;
      subscribePersistenceEvents();
      await load(true);
      let bound = true;
      return () => {
        if (!bound) return;
        bound = false;
        unsubscribeEvent();
        unsubscribeEvent = () => {};
        if (activePreferences === nextPreferences) activePreferences = null;
        if (activeEvents === nextEvents) activeEvents = null;
      };
    },
    dispose() {
      unsubscribeEvent();
      unsubscribeContributions();
      unsubscribeRunners();
      listeners.clear();
    },
  };
}

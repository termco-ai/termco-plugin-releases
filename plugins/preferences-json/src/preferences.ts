import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  PreferenceChangeListener,
  PreferencesCapability,
  StorageCapability,
  StorageHandle,
} from "@termco/storage-base";

export const PREFERENCES_STORE = "termco-settings.json";
/** Frozen wire event shared with the platform renderer projection. Main source
 * plugins import lifecycle types from `@termco/kernel` and service contracts
 * from their owning `@termco/*-base` packages; runtime bundles do not depend on
 * a host package resolver. */
export const PREFERENCES_CHANGED_EVENT = "termco://prefs-changed";

const VALID_KEY = /^[A-Za-z][A-Za-z0-9.-]*$/;

function checkedKey(key: string): string {
  if (!VALID_KEY.test(key)) {
    throw new Error(`invalid preference key "${key}"`);
  }
  return key;
}

export async function createPreferences(
  storage: StorageCapability,
  events: ApplicationEventsCapability,
): Promise<PreferencesCapability> {
  const handle = await storage.open(PREFERENCES_STORE);

  return {
    async get<T>(key: string): Promise<T | undefined> {
      return handle.get<T>(checkedKey(key));
    },
    async getMany(keys: string[]): Promise<Record<string, unknown>> {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const checked = checkedKey(key);
        const value = handle.get(checked);
        if (value !== undefined) result[checked] = value;
      }
      return result;
    },
    async set(key: string, value: unknown): Promise<void> {
      const checked = checkedKey(key);
      if (value === undefined) {
        throw new Error("preference values cannot be undefined; use delete() instead");
      }
      handle.set(checked, value);
      await handle.save();
      events.emit(PREFERENCES_CHANGED_EVENT, { key: checked, value });
    },
    async delete(key: string): Promise<boolean> {
      const checked = checkedKey(key);
      const removed = handle.delete(checked);
      if (removed) {
        await handle.save();
        events.emit(PREFERENCES_CHANGED_EVENT, { key: checked, value: undefined });
      }
      return removed;
    },
    subscribe(listener: PreferenceChangeListener): () => void {
      return events.subscribe(PREFERENCES_CHANGED_EVENT, (payload) => {
        if (!payload || typeof payload !== "object") return;
        const change = payload as { key?: unknown; value?: unknown };
        if (typeof change.key !== "string") return;
        listener(change.key, change.value);
      });
    },
  };
}

/** Always-present preference state. Durable storage and cross-window events
 * can leave without removing the facade or its subscribers. */
export function createStablePreferences(): {
  capability: PreferencesCapability;
  bind(
    storage: StorageCapability,
    events: ApplicationEventsCapability,
  ): Promise<() => Promise<void>>;
} {
  const values = new Map<string, unknown>();
  const locallyAuthored = new Set<string>();
  let providerHydrated = new Set<string>();
  let hasBoundProvider = false;
  const listeners = new Set<PreferenceChangeListener>();
  const instance = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let binding:
    | {
        storage: StorageCapability;
        handle: StorageHandle;
        events: ApplicationEventsCapability;
        unsubscribe: () => void;
      }
    | undefined;

  const publish = (key: string, value: unknown) => {
    for (const listener of listeners) listener(key, value);
  };
  const capability: PreferencesCapability = {
    async get<T>(key: string) {
      return values.get(checkedKey(key)) as T | undefined;
    },
    async getMany(keys) {
      return Object.fromEntries(
        keys.flatMap((key) => {
          const checked = checkedKey(key);
          return values.has(checked) ? [[checked, values.get(checked)]] : [];
        }),
      );
    },
    async set(key, value) {
      const checked = checkedKey(key);
      if (value === undefined) {
        throw new Error("preference values cannot be undefined; use delete() instead");
      }
      locallyAuthored.add(checked);
      providerHydrated.delete(checked);
      values.set(checked, value);
      if (binding) {
        binding.handle.set(checked, value);
        await binding.handle.save();
        binding.events.emit(PREFERENCES_CHANGED_EVENT, {
          key: checked,
          value,
          instance,
        });
      }
      publish(checked, value);
    },
    async delete(key) {
      const checked = checkedKey(key);
      const removed = values.delete(checked);
      if (!removed) return false;
      locallyAuthored.add(checked);
      providerHydrated.delete(checked);
      if (binding) {
        binding.handle.delete(checked);
        await binding.handle.save();
        binding.events.emit(PREFERENCES_CHANGED_EVENT, {
          key: checked,
          value: undefined,
          instance,
        });
      }
      publish(checked, undefined);
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    capability,
    async bind(storage, events) {
      const handle = await storage.open(PREFERENCES_STORE);
      const nextProviderValues = new Map(handle.entries());
      const removedProviderKeys = [...providerHydrated].filter(
        (key) => !nextProviderValues.has(key) && !locallyAuthored.has(key),
      );
      for (const key of removedProviderKeys) values.delete(key);

      const nextProviderHydrated = new Set<string>();
      for (const [key, value] of nextProviderValues) {
        if (hasBoundProvider && locallyAuthored.has(key)) continue;
        values.set(key, value);
        locallyAuthored.delete(key);
        nextProviderHydrated.add(key);
      }
      providerHydrated = nextProviderHydrated;
      hasBoundProvider = true;

      for (const key of removedProviderKeys) publish(key, undefined);
      for (const [key, value] of values) publish(key, value);
      const current = {
        storage,
        handle,
        events,
        unsubscribe: events.subscribe(PREFERENCES_CHANGED_EVENT, (payload) => {
          if (!payload || typeof payload !== "object") return;
          const change = payload as {
            key?: unknown;
            value?: unknown;
            instance?: unknown;
          };
          if (change.instance === instance || typeof change.key !== "string") return;
          locallyAuthored.delete(change.key);
          if (change.value === undefined) {
            values.delete(change.key);
            providerHydrated.delete(change.key);
          } else {
            values.set(change.key, change.value);
            providerHydrated.add(change.key);
          }
          publish(change.key, change.value);
        }),
      };
      binding?.unsubscribe();
      binding = current;
      let bound = true;
      return async () => {
        if (!bound) return;
        bound = false;
        current.unsubscribe();
        if (binding === current) binding = undefined;
        await storage.close(PREFERENCES_STORE);
      };
    },
  };
}

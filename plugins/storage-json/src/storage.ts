import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type { StorageCapability, StorageHandle } from "@termco/storage-base";

interface StoreState {
  data: Map<string, unknown>;
  dirty: boolean;
}

function safeStoreName(path: string): string {
  if (basename(path) !== path || path === "." || path === "..") {
    throw new Error(`storage path must be a bare filename: ${path}`);
  }
  return path;
}

export function createJsonStorage(userData: string): StorageCapability {
  const stores = new Map<string, StoreState>();
  const writes = new Map<string, Promise<void>>();

  const filePath = (path: string) => join(userData, safeStoreName(path));
  const persistNow = async (path: string, state: StoreState) => {
    await fs.mkdir(userData, { recursive: true });
    const target = filePath(path);
    const temporary = `${target}.${process.pid}.tmp`;
    await fs.writeFile(
      temporary,
      JSON.stringify(Object.fromEntries(state.data), null, 2),
      "utf8",
    );
    await fs.rename(temporary, target);
    state.dirty = false;
  };
  const persist = async (path: string, state: StoreState) => {
    const previous = writes.get(path) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => persistNow(path, state));
    writes.set(path, current);
    try {
      await current;
    } finally {
      if (writes.get(path) === current) writes.delete(path);
    }
  };

  const handle = (path: string, state: StoreState): StorageHandle => ({
    get: <T>(key: string) => state.data.get(key) as T | undefined,
    set(key, value) {
      state.data.set(key, value);
      state.dirty = true;
    },
    has: (key) => state.data.has(key),
    delete(key) {
      const removed = state.data.delete(key);
      if (removed) state.dirty = true;
      return removed;
    },
    keys: () => [...state.data.keys()],
    values: () => [...state.data.values()],
    entries: () => [...state.data.entries()],
    clear() {
      state.data.clear();
      state.dirty = true;
    },
    reset(defaults = {}) {
      state.data = new Map(Object.entries(defaults));
      state.dirty = true;
    },
    save: () => persist(path, state),
  });

  return {
    async open(path, defaults = {}) {
      safeStoreName(path);
      let state = stores.get(path);
      if (!state) {
        const data = new Map<string, unknown>(Object.entries(defaults));
        try {
          const parsed = JSON.parse(await fs.readFile(filePath(path), "utf8")) as Record<
            string,
            unknown
          >;
          for (const [key, value] of Object.entries(parsed)) data.set(key, value);
        } catch {
          // Missing or invalid files start with declared defaults.
        }
        state = { data, dirty: false };
        stores.set(path, state);
      }
      return handle(path, state);
    },
    async close(path) {
      const state = stores.get(path);
      if (!state) return;
      if (state.dirty) await persist(path, state);
      stores.delete(path);
    },
  };
}

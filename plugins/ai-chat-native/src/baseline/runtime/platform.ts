import type { ApplicationEventsCapability } from "@termco/events-base";
import type {
  StorageCapability,
  StorageHandle,
} from "@termco/storage-base";

type ChangeCallback = (key: string, value: unknown) => void;

type Runtime = {
  storage: StorageCapability;
  events: ApplicationEventsCapability;
};

let runtime: Runtime | null = null;

export function aiPlatformRuntimeActive(): boolean {
  return runtime !== null;
}

export function configurePlatformRuntime(next: Runtime): () => void {
  runtime = next;
  return () => {
    if (runtime === next) runtime = null;
  };
}

function selectedRuntime(): Runtime {
  if (!runtime) throw new Error("ai-chat-native platform runtime is unavailable");
  return runtime;
}

/** Plugin-owned store with application-wide persistence and lifecycle. */
export class LazyStore {
  readonly #path: string;
  readonly #defaults: Record<string, unknown>;
  readonly #autoSaveMs: number;
  #handle: Promise<StorageHandle> | null = null;
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #subscribers = new Set<ChangeCallback>();

  constructor(
    path: string,
    options?: { defaults?: Record<string, unknown>; autoSave?: boolean | number },
  ) {
    this.#path = path;
    this.#defaults = options?.defaults ?? {};
    this.#autoSaveMs =
      typeof options?.autoSave === "number"
        ? options.autoSave
        : options?.autoSave
          ? 100
          : 0;
  }

  #open(): Promise<StorageHandle> {
    this.#handle ??= selectedRuntime().storage.open(this.#path, this.#defaults);
    return this.#handle;
  }

  #changed(key: string, value: unknown): void {
    for (const subscriber of this.#subscribers) subscriber(key, value);
  }

  #scheduleSave(handle: StorageHandle): void {
    if (this.#autoSaveMs <= 0) {
      void handle.save();
      return;
    }
    if (this.#saveTimer) clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => void handle.save(), this.#autoSaveMs);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.#open()).get<T>(key);
  }

  async set(key: string, value: unknown): Promise<void> {
    const handle = await this.#open();
    handle.set(key, value);
    this.#changed(key, value);
    this.#scheduleSave(handle);
  }

  async has(key: string): Promise<boolean> {
    return (await this.#open()).has(key);
  }

  async delete(key: string): Promise<boolean> {
    const handle = await this.#open();
    const removed = handle.delete(key);
    this.#changed(key, undefined);
    this.#scheduleSave(handle);
    return removed;
  }

  async keys(): Promise<string[]> {
    return (await this.#open()).keys();
  }

  async values<T>(): Promise<T[]> {
    return (await this.#open()).values() as T[];
  }

  async entries<T>(): Promise<Array<[string, T]>> {
    return (await this.#open()).entries() as Array<[string, T]>;
  }

  async length(): Promise<number> {
    return (await this.#open()).keys().length;
  }

  async clear(): Promise<void> {
    const handle = await this.#open();
    handle.clear();
    this.#scheduleSave(handle);
  }

  async reset(): Promise<void> {
    const handle = await this.#open();
    handle.reset(this.#defaults);
    this.#scheduleSave(handle);
  }

  async save(): Promise<void> {
    await (await this.#open()).save();
  }

  async onChange<T>(callback: (key: string, value: T) => void): Promise<() => void> {
    const wrapped: ChangeCallback = (key, value) => callback(key, value as T);
    this.#subscribers.add(wrapped);
    return () => this.#subscribers.delete(wrapped);
  }
}

export async function emit(event: string, payload?: unknown): Promise<void> {
  selectedRuntime().events.emit(event, payload);
}

export async function listen<T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void,
): Promise<() => void> {
  let id = 0;
  return selectedRuntime().events.subscribe(event, (payload) => {
    handler({ event, id: id++, payload: payload as T });
  });
}

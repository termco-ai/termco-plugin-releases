import {
  SETTINGS_PREFERENCES_SERVICE,
  type PreferencesCapability,
} from "@termco/storage-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessRemoteDispose,
  type ProcessTransport,
} from "@termco/kernel";

export function createRendererPreferencesCapability(
  transport: ProcessTransport,
): PreferencesCapability {
  const remote = createProcessServiceProxy<PreferencesCapability>(
    SETTINGS_PREFERENCES_SERVICE,
    transport,
  );
  const memory = new Map<string, unknown>();
  const unavailable = (error: unknown) =>
    error instanceof Error &&
    /capability ["']?settings\.preferences["']? is unavailable/i.test(
      error.message,
    );
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      try {
        const value = await remote.get<T>(key);
        if (value !== undefined) memory.set(key, value);
        return value;
      } catch (error) {
        if (!unavailable(error)) throw error;
        return memory.get(key) as T | undefined;
      }
    },
    async getMany(keys: string[]): Promise<Record<string, unknown>> {
      try {
        const values = await remote.getMany(keys);
        for (const [key, value] of Object.entries(values)) memory.set(key, value);
        return values;
      } catch (error) {
        if (!unavailable(error)) throw error;
        return Object.fromEntries(
          keys.flatMap((key) =>
            memory.has(key) ? [[key, memory.get(key)]] : [],
          ),
        );
      }
    },
    async set(key: string, value: unknown): Promise<void> {
      try {
        await remote.set(key, value);
      } catch (error) {
        if (!unavailable(error)) throw error;
      }
      memory.set(key, value);
    },
    async delete(key: string): Promise<boolean> {
      try {
        const deleted = await remote.delete(key);
        memory.delete(key);
        return deleted;
      } catch (error) {
        if (!unavailable(error)) throw error;
        return memory.delete(key);
      }
    },
    subscribe(listener) {
      let closed = false;
      const channel = transport.registerChannel((key, value) => {
        if (typeof key === "string") listener(key, value);
      });
      const handle = transport.call(
        SETTINGS_PREFERENCES_SERVICE,
        "subscribe",
        [channel],
      ) as Promise<ProcessRemoteDispose>;
      void handle.catch(() => {
        if (closed) return;
        closed = true;
        transport.releaseChannel(channel);
      });
      return () => {
        if (closed) return;
        closed = true;
        transport.releaseChannel(channel);
        void handle.then(
          (dispose) => transport.releaseRemote(dispose),
          () => {},
        );
      };
    },
  };
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      SETTINGS_PREFERENCES_SERVICE,
      createRendererPreferencesCapability(transport),
    );
  },
};

export default plugin;

import {
  TERMINAL_PTY_SERVICE,
  type PtyCapability,
  type PtyOpenHandlers,
} from "@termco/terminal-base";
import {
  processTransportService,
  type PluginModule,
  type ProcessChannel,
  type ProcessTransport,
} from "@termco/kernel";

export interface RendererPtyCapability extends PtyCapability {
  dispose(): void;
}

interface SessionChannels {
  data: ProcessChannel;
  exit: ProcessChannel;
}

export function createRendererPtyCapability(
  transport: ProcessTransport,
): RendererPtyCapability {
  const sessions = new Map<number, SessionChannels>();
  const release = (id: number) => {
    const channels = sessions.get(id);
    if (!channels) return;
    sessions.delete(id);
    transport.releaseChannel(channels.data);
    transport.releaseChannel(channels.exit);
  };
  const call = (method: string, args: readonly unknown[]) =>
    transport.call(TERMINAL_PTY_SERVICE, method, args, { caller: true });

  return {
    async open(params, handlers: PtyOpenHandlers) {
      const data = transport.registerChannel(handlers.onData);
      let id: number | undefined;
      let exited = false;
      const exit = transport.registerChannel((message) => {
        try {
          handlers.onExit(message);
        } finally {
          exited = true;
          if (id !== undefined) {
            release(id);
          } else {
            transport.releaseChannel(data);
            transport.releaseChannel(exit);
          }
        }
      });
      try {
        id = (await call("open", [params, { onData: data, onExit: exit }])) as number;
        if (!exited) sessions.set(id, { data, exit });
        return id;
      } catch (error) {
        transport.releaseChannel(data);
        transport.releaseChannel(exit);
        throw error;
      }
    },
    write(id, bytes) {
      void call("write", [id, bytes]);
    },
    resize(id, cols, rows) {
      void call("resize", [id, cols, rows]);
    },
    close(id) {
      release(id);
      void call("close", [id]);
    },
    async closeAll() {
      const result = (await call("closeAll", [])) as number;
      for (const id of [...sessions.keys()]) release(id);
      return result;
    },
    hasForegroundProcess(id) {
      return call("hasForegroundProcess", [id]) as Promise<boolean>;
    },
    hasForegroundJob(id) {
      return call("hasForegroundJob", [id]) as Promise<boolean>;
    },
    shellName() {
      return call("shellName", []) as Promise<string>;
    },
    listShells() {
      return call("listShells", []) as ReturnType<PtyCapability["listShells"]>;
    },
    liveSessions() {
      return call("liveSessions", []) as ReturnType<PtyCapability["liveSessions"]>;
    },
    dispose() {
      for (const id of [...sessions.keys()]) {
        release(id);
        void call("close", [id]);
      }
    },
  };
}

const plugin: PluginModule = {
  inject: [processTransportService],
  async activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    const capability = createRendererPtyCapability(transport);
    await context.effect(() => () => capability.dispose());
    context.provide(TERMINAL_PTY_SERVICE, capability);
  },
};

export default plugin;

import {
  SESSION_HISTORY_SERVICE,
  type SessionCommit,
  type SessionHistoryCapability,
} from "@termco/session-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessRemoteDispose,
  type ProcessTransport,
} from "@termco/kernel";

export function createRendererSessionHistory(
  transport: ProcessTransport,
): SessionHistoryCapability {
  const remote = createProcessServiceProxy<SessionHistoryCapability>(
    SESSION_HISTORY_SERVICE,
    transport,
  );
  return {
    create: remote.create,
    append: remote.append,
    readWindow: remote.readWindow,
    inspect: remote.inspect,
    loadForContinuation: remote.loadForContinuation,
    flush: remote.flush,
    fork: remote.fork,
    remove: remote.remove,
    enforceRetention: remote.enforceRetention,
    list: remote.list,
    subscribe(sessionId, listener) {
      const channel = transport.registerChannel((commit) => listener(commit as SessionCommit));
      const handle = transport.call(SESSION_HISTORY_SERVICE, "subscribe", [sessionId, channel]) as Promise<ProcessRemoteDispose>;
      let disposed = false;
      void handle.catch(() => {
        if (disposed) return;
        disposed = true;
        transport.releaseChannel(channel);
      });
      return () => {
        if (disposed) return;
        disposed = true;
        transport.releaseChannel(channel);
        void handle.then(
          (remoteDispose) => transport.releaseRemote(remoteDispose),
          () => undefined,
        );
      };
    },
  };
}

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    context.provide(
      SESSION_HISTORY_SERVICE,
      createRendererSessionHistory(context.get<ProcessTransport>(processTransportService)),
    );
  },
};

export default plugin;

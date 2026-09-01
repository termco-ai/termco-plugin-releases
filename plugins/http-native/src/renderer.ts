import {
  NETWORK_HTTP_SERVICE,
  type HttpCapability,
  type HttpStreamEvent,
} from "@termco/http-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessRemoteDispose,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";
const plugin: PluginModule = { inject: [processTransportService], activate(context) {
  const transport = context.get<ProcessTransport>(processTransportService);
  const remote = createProcessServiceProxy<Services[typeof NETWORK_HTTP_SERVICE]>(
    NETWORK_HTTP_SERVICE,
    transport,
  );
  const capability: HttpCapability = {
    ping: remote.ping,
    request: remote.request,
    async stream(input, emit) {
      const channel = transport.registerChannel((event) => {
        emit(event as HttpStreamEvent);
      });
      let marker: ProcessRemoteDispose;
      try {
        marker = await transport.call(
          NETWORK_HTTP_SERVICE,
          "stream",
          [input, channel],
        ) as ProcessRemoteDispose;
      } catch (error) {
        transport.releaseChannel(channel);
        throw error;
      }
      let disposed = false;
      return async () => {
        if (disposed) return;
        disposed = true;
        transport.releaseChannel(channel);
        await transport.releaseRemote(marker);
      };
    },
  };
  context.provide(NETWORK_HTTP_SERVICE, capability);
} };
export default plugin;

import { NETWORK_HTTP_SERVICE, type HttpCapability } from "@termco/http-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
} from "@termco/kernel";

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      NETWORK_HTTP_SERVICE,
      createProcessServiceProxy<HttpCapability>(NETWORK_HTTP_SERVICE, transport),
    );
  },
};

export default plugin;

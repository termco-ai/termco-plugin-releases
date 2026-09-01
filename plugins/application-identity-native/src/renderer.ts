import {
  APPLICATION_BRANDING_SERVICE,
  APPLICATION_INFO_SERVICE,
  type ApplicationBrandingCapability,
} from "@termco/application-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
  type Services,
} from "@termco/kernel";

const branding: ApplicationBrandingCapability = {
  logoUrl: new URL(
    import.meta.url.startsWith("termco-plugin:")
      ? "./assets/termco-icon.png"
      : "../assets/termco-icon.png",
    import.meta.url,
  ).href,
};

const plugin: PluginModule = {
  inject: [processTransportService],
  activate(context) {
    const transport = context.get<ProcessTransport>(processTransportService);
    context.provide(
      APPLICATION_INFO_SERVICE,
      createProcessServiceProxy<Services[typeof APPLICATION_INFO_SERVICE]>(
        APPLICATION_INFO_SERVICE,
        transport,
      ),
    );
    context.provide(APPLICATION_BRANDING_SERVICE, branding);
  },
};

export default plugin;

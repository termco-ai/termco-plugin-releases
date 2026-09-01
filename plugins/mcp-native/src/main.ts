import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import type { McpClientsCapability } from "@termco/mcp-base";
import type { SecretsCapability } from "@termco/storage-base";
import { clients, connect, disconnectAllMcp } from "./index";
import { configureMcpRuntime } from "./runtime";
import { clearTokens } from "./tokenStore";
import { DESKTOP_INTEGRATION_SERVICE } from "@termco/desktop-base";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { SECRETS_APPLICATION_SERVICE } from "@termco/storage-base";

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
    DESKTOP_INTEGRATION_SERVICE,
    SECRETS_APPLICATION_SERVICE,
  ],
  async activate(context) {
    await context.effect(() =>
      configureMcpRuntime({
        events: context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
        desktop: context.get<DesktopIntegrationCapability>(
          "desktop.integration",
        ),
        secrets: context.get<SecretsCapability>("secrets.application"),
      }),
    );
    await context.effect(() => disconnectAllMcp);
    const capability: McpClientsCapability = {
      connect,
      disconnect(name) {
        clients.get(name)?.disconnect();
        clients.delete(name);
      },
      async clearOAuth(name) {
        clients.get(name)?.disconnect();
        clients.delete(name);
        await clearTokens(name);
      },
      status(name) {
        const client = clients.get(name);
        return { connected: client?.connected ?? false, tools: client?.listTools() ?? [] };
      },
      async call(name, tool, argumentsValue) {
        const client = clients.get(name);
        if (!client?.connected) return { error: `MCP server "${name}" is not connected.` };
        try {
          return await client.callTool(tool, argumentsValue ?? {});
        } catch (error) {
          return { error: String(error instanceof Error ? error.message : error) };
        }
      },
      disconnectAll: disconnectAllMcp,
      liveResources: () => [...clients.keys()].map((name) => ({ id: name, label: name })),
    };
    context.provide("mcp.clients", capability);
  },
  replacementImpact() {
    const resources = [...clients.keys()].map((name) => ({ id: name, label: name }));
    return resources.length === 0
      ? []
      : [{ capability: "mcp.clients", resourceLabel: "MCP connections", resources }];
  },
};

export default plugin;

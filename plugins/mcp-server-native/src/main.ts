import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { webContents } from "electron";
import type { PluginModule } from "@termco/kernel";
import {
  SETTINGS_PREFERENCES_SERVICE,
  type PreferencesCapability,
} from "@termco/storage-base";
import type {
  McpServerCapability,
  McpServerCapabilityCaller,
} from "@termco/mcp-base";
import type { SurfaceEntry, ToolReply } from "./bridge";
import {
  connectSnippet,
  type ExternalBackend,
  registerCommand,
} from "./onboarding";
import type { RigMirrorEntry } from "./rigRegistry";
import { EMPTY_TOOL_PROVIDER } from "./toolProvider";
import {
  _internals,
  mcpBridge,
  mcpServerRunning,
  mcpServerUrl,
  mintRunToken,
  registerExecutorSender,
  releaseRunToken,
  resolveRendererReply,
  setMcpGlobalAutoRunResolver,
  setMcpRunApprovalHandler,
  setMcpRunFullAutoResolver,
  setMcpToolProvider,
  startMcpServer,
  stopMcpServer,
  unregisterExecutorSender,
} from "./index";

const { rigRegistry, tokenStore } = _internals;

const COMMANDS = [
  "mcp_bridge_register",
  "mcp_bridge_unregister",
  "mcp_surface_register",
  "mcp_tool_result",
  "mcp_tool_approval",
  "mcp_renderer_reply",
  "mcp_rigs_sync",
  "mcp_token_create",
  "mcp_token_list",
  "mcp_token_revoke",
  "mcp_register_agent",
  "mcp_server_status",
  "mcp_rigs_list",
] as const;

async function invoke(
  command: string,
  payload: Record<string, unknown>,
  caller?: McpServerCapabilityCaller,
): Promise<unknown> {
  switch (command) {
    case "mcp_bridge_register": {
      const sender = webContents.fromId(caller?.senderWebContentsId ?? 0);
      if (!sender || sender.isDestroyed()) throw new Error("MCP executor window is unavailable");
      if (typeof payload.receiver !== "function") {
        throw new Error("MCP executor receiver channel is unavailable");
      }
      registerExecutorSender(
        sender,
        payload.receiver as (message: unknown) => void,
      );
      return { ok: true };
    }
    case "mcp_bridge_unregister": {
      const sender = webContents.fromId(caller?.senderWebContentsId ?? 0);
      if (sender && !sender.isDestroyed()) unregisterExecutorSender(sender);
      return { ok: true };
    }
    case "mcp_surface_register":
      mcpBridge.setSurface(
        (Array.isArray(payload.tools) ? payload.tools : []) as SurfaceEntry[],
      );
      return { ok: true };
    case "mcp_tool_result":
      mcpBridge.resolveResult(payload as unknown as ToolReply);
      return { ok: true };
    case "mcp_tool_approval":
      return mcpBridge.requestApproval({
        requestId: String(payload.requestId ?? ""),
        resolution:
          payload.resolution && typeof payload.resolution === "object"
            ? payload.resolution as { action?: unknown; reason?: unknown }
            : {},
      });
    case "mcp_renderer_reply":
      resolveRendererReply(String(payload.requestId), payload.value ?? null);
      return { ok: true };
    case "mcp_rigs_sync": {
      const rigs = (Array.isArray(payload.rigs) ? payload.rigs : []) as RigMirrorEntry[];
      const before = new Set(rigRegistry.list().map((rig) => rig.id));
      rigRegistry.set(rigs);
      const after = new Set(rigs.map((rig) => rig.id));
      for (const id of before) {
        if (!after.has(id)) tokenStore.revokeTokensForRig(id);
      }
      return { ok: true };
    }
    case "mcp_token_create": {
      const { token, info } = tokenStore.createUserToken({
        label: String(payload.label ?? ""),
        rigId: payload.rigId ? String(payload.rigId) : null,
        autoApprove: Boolean(payload.autoApprove),
      });
      return { token, info, url: mcpServerUrl() };
    }
    case "mcp_token_list":
      return tokenStore.listUserTokens();
    case "mcp_token_revoke":
      return { ok: tokenStore.revokeUserToken(String(payload.id)) };
    case "mcp_register_agent": {
      const url = mcpServerUrl();
      const token = String(payload.token ?? "");
      if (!url || !token) return { ok: false, error: "server not running or no token" };
      const backend = payload.backend as ExternalBackend | "other";
      if (backend === "other") return { ok: true, snippet: connectSnippet(url, token) };
      const registration = registerCommand(backend, url, token);
      try {
        const result = await promisify(execFile)(registration.bin, registration.args, {
          timeout: 8000,
          encoding: "utf8",
        });
        return { ok: true, output: (result.stdout || "").trim() };
      } catch (error) {
        const failure = error as { stderr?: string; message?: string };
        return {
          ok: false,
          error: (failure.stderr || failure.message || "registration failed").trim(),
          snippet: connectSnippet(url, token),
        };
      }
    }
    case "mcp_server_status":
      return { url: mcpServerUrl(), running: mcpServerRunning() };
    case "mcp_rigs_list":
      return rigRegistry.list();
    default:
      throw new Error(`unknown MCP server command: ${command}`);
  }
}

let activeCapability: McpServerCapability | null = null;

const plugin: PluginModule = {
  inject: [SETTINGS_PREFERENCES_SERVICE],
  async activate(context) {
    const preferences = context.get<PreferencesCapability>(
      SETTINGS_PREFERENCES_SERVICE,
    );
    let globalAutoRun = await preferences.get<boolean>("agentAutoApprove") === true;
    await context.effect(() => {
      const disposePreferences = preferences.subscribe((key, value) => {
        if (key === "agentAutoApprove") globalAutoRun = value === true;
      });
      setMcpGlobalAutoRunResolver(() => globalAutoRun);
      return () => {
        disposePreferences();
        setMcpGlobalAutoRunResolver(null);
      };
    });
    tokenStore.load();
    setMcpToolProvider(mcpBridge.provider);
    void startMcpServer().catch(() => {});

    const capability: McpServerCapability = {
      async syncRigs(rigs) {
        const before = new Set(rigRegistry.list().map((rig) => rig.id));
        rigRegistry.set([...rigs]);
        const after = new Set(rigs.map((rig) => rig.id));
        for (const id of before) {
          if (!after.has(id)) tokenStore.revokeTokensForRig(id);
        }
      },
      commands: () => COMMANDS,
      invoke,
      url: mcpServerUrl,
      mintRunToken,
      releaseRunToken,
      setRunApprovalHandler: setMcpRunApprovalHandler,
      setRunFullAutoResolver: setMcpRunFullAutoResolver,
      liveResources() {
        const resources = tokenStore.listUserTokens().map((token) => ({
          id: token.id,
          label: `Access token: ${token.label}`,
        }));
        const managed = tokenStore._runTokenCount();
        if (managed > 0) {
          resources.push({ id: "managed-runs", label: `${managed} managed run token(s)` });
        }
        const url = mcpServerUrl();
        if (url) resources.push({ id: "server", label: url });
        return resources;
      },
    };
    activeCapability = capability;
    context.provide("mcp.server", capability);
    return async () => {
      setMcpRunApprovalHandler(null);
      setMcpRunFullAutoResolver(null);
      setMcpToolProvider(EMPTY_TOOL_PROVIDER);
      await stopMcpServer();
      if (activeCapability === capability) activeCapability = null;
    };
  },
  replacementImpact() {
    const resources = activeCapability?.liveResources() ?? [];
    return resources.length === 0
      ? []
      : [{ capability: "mcp.server", resourceLabel: "MCP server sessions and access tokens", resources }];
  },
};

export default plugin;

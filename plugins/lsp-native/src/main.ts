import { app, webContents } from "electron";
import { join } from "node:path";
import type * as lsp from "vscode-languageserver-protocol";
import type {
  LspCapabilityCaller,
  LspServerListEntry,
  LspSessionsCapability,
} from "@termco/editor-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { WorkspaceFilesCapability } from "@termco/files-base";
import type { PluginModule } from "@termco/kernel";
import type { WorkspaceEnv } from "@termco/workspace-base";
import {
  configureLspConfigPath,
  effectiveServers,
  removeCustomServer,
  serverById,
  setServerEnabled,
  updateServerOverride,
  upsertCustomServer,
} from "./config";
import { formatDocument } from "./format";
import { configureLspInstallRoot, detectServer, installServer } from "./install";
import { disposeLspManagerSync, lspManager } from "./index";
import {
  hoverToMarkdown,
  normalizeCompletion,
  normalizeDefinition,
} from "./normalize";
import { configureLspRuntime, lspRuntime } from "./runtime";
import type { DocChange, LspServerConfig } from "./types";
import { lspLanguageId } from "./types";
import { EVENTS_APPLICATION_SERVICE } from "@termco/events-base";
import { WORKSPACE_FILES_SERVICE } from "@termco/files-base";
import { WORKSPACE_EXECUTION_SERVICE, type WorkspaceExecutionCapability } from "@termco/workspace-base";

async function serversWithStatus(): Promise<LspServerListEntry[]> {
  const running = new Map(lspManager().statusList().map((status) => [status.serverId, status]));
  return Promise.all(
    effectiveServers().map(async (config) => {
      const session = running.get(config.id);
      const status: LspServerListEntry["status"] =
        session && (session.state === "running" || session.state === "starting")
          ? "running"
          : await detectServer(config);
      return { config, status, detail: session?.lastError };
    }),
  );
}

async function invoke(
  command: string,
  payload: Record<string, unknown>,
  caller: LspCapabilityCaller,
): Promise<unknown> {
  const ws = payload.workspace as WorkspaceEnv;
  const manager = lspManager();
  switch (command) {
    case "lsp_doc_open": {
      const sender = webContents.fromId(caller.senderWebContentsId);
      if (sender && !sender.isDestroyed()) manager.watchSender(sender);
      const language = payload.languageId as string;
      return manager.docOpen(
        ws,
        (payload.rigRoot as string | null) ?? null,
        payload.path as string,
        language,
        lspLanguageId(language),
        payload.text as string,
        caller.senderWebContentsId,
      );
    }
    case "lsp_doc_change":
      return manager.docChange(
        ws,
        payload.path as string,
        payload.version as number,
        payload.changes as DocChange[],
        payload.checksum as number | undefined,
      );
    case "lsp_doc_resync":
      manager.docResync(ws, payload.path as string, payload.version as number, payload.text as string);
      return null;
    case "lsp_doc_close":
      manager.docClose(ws, payload.path as string, caller.senderWebContentsId);
      return null;
    case "lsp_doc_save":
      manager.docSave(ws, payload.path as string);
      return null;
    case "lsp_hover": {
      const hover = await manager.hover(ws, payload.path as string, payload.position as lsp.Position);
      if (!hover) return null;
      const markdown = hoverToMarkdown(hover);
      return markdown.trim() ? { markdown, range: hover.range ?? null } : null;
    }
    case "lsp_definition":
      return normalizeDefinition(
        await manager.definition(ws, payload.path as string, payload.position as lsp.Position),
      );
    case "lsp_completion": {
      const result = payload.sessionKey
        ? await manager.completionBySession(
            payload.sessionKey as string,
            payload.path as string,
            payload.position as lsp.Position,
            payload.context as lsp.CompletionContext | undefined,
          )
        : await manager.completion(
            ws,
            payload.path as string,
            payload.position as lsp.Position,
            payload.context as lsp.CompletionContext | undefined,
          );
      return { requestId: payload.requestId ?? null, ...normalizeCompletion(result) };
    }
    case "lsp_completion_resolve":
      return manager.resolveCompletion(
        payload.sessionKey as string,
        payload.item as lsp.CompletionItem,
      );
    case "format_document":
      return formatDocument(
        manager,
        ws,
        (payload.rigRoot as string | null) ?? null,
        payload.path as string,
        payload.text as string,
      );
    case "lsp_semantic_tokens":
      return manager.semanticTokens(ws, payload.path as string);
    case "lsp_signature_help":
      return manager.signatureHelp(
        ws,
        payload.path as string,
        payload.position as lsp.Position,
        payload.context as lsp.SignatureHelpContext | undefined,
      );
    case "lsp_diagnostics": {
      const path = payload.path as string | undefined;
      if (!path) return { files: manager.cachedDiagnostics(ws) };
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      return manager.diagnosticsForFile(
        ws,
        (payload.rigRoot as string | null) ?? null,
        path,
        extension,
        lspLanguageId(extension),
        async () => {
          try {
            const read = (await lspRuntime().files.readFile(path, ws)) as {
              kind: string;
              content?: string;
            };
            return read.kind === "text" ? (read.content ?? null) : null;
          } catch {
            return null;
          }
        },
      );
    }
    case "lsp_status":
      return { sessions: manager.statusList() };
    case "lsp_servers_list":
      return serversWithStatus();
    case "lsp_server_toggle":
      setServerEnabled(payload.id as string, Boolean(payload.enabled));
      return null;
    case "lsp_server_upsert":
      upsertCustomServer(payload.server as LspServerConfig);
      return null;
    case "lsp_server_remove":
      removeCustomServer(payload.id as string);
      return null;
    case "lsp_server_update":
      updateServerOverride(
        payload.id as string,
        payload.patch as Parameters<typeof updateServerOverride>[1],
      );
      return null;
    case "lsp_install": {
      const config = serverById(payload.serverId as string);
      if (!config) throw new Error(`unknown server: ${String(payload.serverId)}`);
      const progress = caller.progress ?? (() => {});
      try {
        await installServer(config, progress);
        lspRuntime().events.emit("lsp:status", { sessions: manager.statusList() });
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        progress({ phase: "error", message });
        return { ok: false, error: message };
      }
    }
    case "lsp_session_restart":
      await manager.restartSession(payload.sessionKey as string);
      return null;
    default:
      throw new Error(`unknown LSP command: ${command}`);
  }
}

let activeCapability: LspSessionsCapability | null = null;

export function lspCapabilityActive(): boolean {
  return activeCapability !== null;
}

const plugin: PluginModule = {
  inject: [
    EVENTS_APPLICATION_SERVICE,
    WORKSPACE_EXECUTION_SERVICE,
    WORKSPACE_FILES_SERVICE,
  ],
  async activate(context) {
    const userData = app.getPath("userData");
    await context.effect(() => {
      configureLspConfigPath(join(userData, "termco-lsp.json"));
      return () => configureLspConfigPath(null);
    });
    await context.effect(() => {
      configureLspInstallRoot(join(userData, "lsp"));
      return () => configureLspInstallRoot(null);
    });
    const events = context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE);
    const execution = context.get<WorkspaceExecutionCapability>(WORKSPACE_EXECUTION_SERVICE);
    const files = context.get<WorkspaceFilesCapability>("workspace.files");
    await context.effect(() => {
      configureLspRuntime({ events, execution, files });
      return () => configureLspRuntime(null);
    });
    const capability: LspSessionsCapability = {
      listServers: serversWithStatus,
      async sessionStatus() {
        return lspManager().statusList();
      },
      async diagnosticsForOpenDocument(workspace, path) {
        return lspManager().diagnosticSlices(workspace, path).map((slice) => ({
          serverId: slice.serverId,
          diagnostics: slice.diagnostics.map((diagnostic) => ({
            range: diagnostic.range,
            severity: diagnostic.severity,
            message:
              typeof diagnostic.message === "string"
                ? diagnostic.message
                : diagnostic.message.value,
            source: diagnostic.source,
            code: diagnostic.code,
          })),
        }));
      },
      async setServerEnabled(id, enabled) {
        setServerEnabled(id, enabled);
      },
      async upsertServer(server) {
        upsertCustomServer(server);
      },
      async removeServer(id) {
        removeCustomServer(id);
      },
      async installServer(serverId) {
        return invoke("lsp_install", { serverId }, { senderWebContentsId: 0 }) as Promise<{
          ok: boolean;
          error?: string;
        }>;
      },
      async restartSession(sessionKey) {
        await lspManager().restartSession(sessionKey);
      },
      invoke,
      liveResources: () =>
        lspManager().statusList().map((session) => ({
          id: session.sessionKey,
          label: `${session.serverId}: ${session.root} (${session.state})`,
        })),
    };
    activeCapability = capability;
    await context.effect(() => () => {
      disposeLspManagerSync();
      if (activeCapability === capability) activeCapability = null;
    });
    context.provide("lsp.sessions", capability);
  },
  replacementImpact() {
    const resources = activeCapability?.liveResources() ?? [];
    return resources.length === 0
      ? []
      : [{ capability: "lsp.sessions", resourceLabel: "language-server sessions", resources }];
  },
};

export default plugin;

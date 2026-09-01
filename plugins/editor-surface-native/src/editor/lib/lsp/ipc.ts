/**
 * Typed invoke wrappers for the lsp_* commands. Every call carries the
 * requesting editor's workspace env explicitly (threaded from its tab's rig)
 * — never the global env store.
 */
import type { WorkspaceEnv } from "../../../workspace";
import { invoke } from "../../../platform";
import type { LspPosition, LspRange } from "./positions";

export type DocOpenResult = {
  active: boolean;
  sessionKey?: string;
  serverId?: string;
  reason?: "no-server" | "disabled" | "missing" | "toolarge" | "error";
  detail?: string;
  triggers?: {
    completion: string[];
    signature: string[];
    signatureRetrigger: string[];
  };
  /** Secondary (linter-class) sessions on this doc — their completions join
   * the popup via sessionKey-targeted lsp_completion calls. */
  secondaries?: Array<{ sessionKey: string; serverId: string }>;
};

export type DocChangePayload = { range?: LspRange; text: string };

export type HoverResult = { markdown: string; range: LspRange | null } | null;

export type DefinitionLocation = {
  path: string;
  line: number;
  character: number;
};

export type LspCompletionItem = {
  label: string;
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string };
  insertText?: string;
  insertTextFormat?: number;
  textEdit?:
    | { range: LspRange; newText: string }
    | { insert: LspRange; replace: LspRange; newText: string };
  additionalTextEdits?: Array<{ range: LspRange; newText: string }>;
  sortText?: string;
  filterText?: string;
  commitCharacters?: string[];
  data?: unknown;
};

export type CompletionResult = {
  requestId: number | null;
  isIncomplete: boolean;
  items: LspCompletionItem[];
};

export type SignatureHelpResult = {
  signatures: Array<{
    label: string;
    documentation?: string | { kind: string; value: string };
    parameters?: Array<{
      label: string | [number, number];
      documentation?: string | { kind: string; value: string };
    }>;
    activeParameter?: number;
  }>;
  activeSignature?: number;
  activeParameter?: number;
} | null;

export type LspDiagnosticPayload = {
  scopeKey: string;
  path: string;
  /** Producing server; "*" clears every server's slice for the doc. */
  serverId: string;
  version?: number;
  diagnostics: Array<{
    range: LspRange;
    severity?: number;
    message: string;
    source?: string;
    code?: string | number;
  }>;
};

export type SessionStatus = {
  sessionKey: string;
  serverId: string;
  scopeKey: string;
  root: string;
  state: "starting" | "running" | "restarting" | "error" | "stopped";
  openDocs: number;
  pid?: number;
  lastError?: string;
};

export function lspDocOpen(args: {
  workspace: WorkspaceEnv;
  rigRoot: string | null;
  path: string;
  languageId: string;
  text: string;
}): Promise<DocOpenResult> {
  return invoke<DocOpenResult>("lsp_doc_open", args);
}

export function lspDocChange(args: {
  workspace: WorkspaceEnv;
  path: string;
  version: number;
  changes: DocChangePayload[];
  checksum: number;
}): Promise<{ resync?: true }> {
  return invoke<{ resync?: true }>("lsp_doc_change", args);
}

export function lspDocResync(args: {
  workspace: WorkspaceEnv;
  path: string;
  version: number;
  text: string;
}): Promise<null> {
  return invoke<null>("lsp_doc_resync", args);
}

export function lspDocClose(
  workspace: WorkspaceEnv,
  path: string,
): Promise<null> {
  return invoke<null>("lsp_doc_close", { workspace, path });
}

export function lspDocSave(
  workspace: WorkspaceEnv,
  path: string,
): Promise<null> {
  return invoke<null>("lsp_doc_save", { workspace, path });
}

export function lspHover(
  workspace: WorkspaceEnv,
  path: string,
  position: LspPosition,
): Promise<HoverResult> {
  return invoke<HoverResult>("lsp_hover", { workspace, path, position });
}

export function lspDefinition(
  workspace: WorkspaceEnv,
  path: string,
  position: LspPosition,
): Promise<DefinitionLocation[]> {
  return invoke<DefinitionLocation[]>("lsp_definition", {
    workspace,
    path,
    position,
  });
}

export function lspCompletion(args: {
  workspace: WorkspaceEnv;
  path: string;
  position: LspPosition;
  context?: { triggerKind: number; triggerCharacter?: string };
  requestId: number;
  /** Target ONE specific (secondary) session instead of the doc's primary. */
  sessionKey?: string;
}): Promise<CompletionResult> {
  return invoke<CompletionResult>("lsp_completion", args);
}

export function lspCompletionResolve(
  sessionKey: string,
  item: LspCompletionItem,
): Promise<LspCompletionItem> {
  return invoke<LspCompletionItem>("lsp_completion_resolve", {
    sessionKey,
    item,
  });
}

export function lspSignatureHelp(
  workspace: WorkspaceEnv,
  path: string,
  position: LspPosition,
  context?: {
    triggerKind: number;
    triggerCharacter?: string;
    isRetrigger: boolean;
  },
): Promise<SignatureHelpResult> {
  return invoke<SignatureHelpResult>("lsp_signature_help", {
    workspace,
    path,
    position,
    context,
  });
}

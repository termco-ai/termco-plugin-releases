import type { Dispose } from "@termco/kernel";
import type {
  ApprovalId,
  JsonObject,
  JsonValue,
  PluginProvenance,
  RequestId,
  SessionId,
  StepId,
  ToolCallId,
  TurnId,
} from "@termco/session-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

/** Public, AI-SDK-independent tool shape. The selected `ai.sessions` provider
 * adapts this stable capability contract to whichever model SDK it owns. */
export interface AiToolMetadata {
  description?: string;
  inputSchema: Record<string, unknown>;
  needsApproval?:
    | boolean
    | ((input: unknown) => boolean | PromiseLike<boolean>);
  /** Safety-critical calls remain gated when a session otherwise allows
   * automatic execution. */
  alwaysNeedsApproval?:
    | boolean
    | ((input: unknown) => boolean | PromiseLike<boolean>);
  concurrency?: "safe" | "exclusive";
  toModelOutput?(input: { output: unknown }): unknown;
}

/** Normal tool: validation is followed by an implementation call. */
export interface AiToolDefinition extends AiToolMetadata {
  execute(input: unknown): unknown | PromiseLike<unknown>;
}

/** Interaction tool: the consuming UI renders the call, pauses the run, and
 * later supplies the output. It must not have a hidden implementation. */
export interface AiInteractiveToolDefinition extends AiToolMetadata {
  execute?: never;
}

export type AiToolEntry = AiToolDefinition | AiInteractiveToolDefinition;

export type AiToolApprovalMode = "ask" | "allow-safe" | "deny";

export interface AiToolApprovalResolution {
  readonly action: "allow" | "ask" | "deny";
  readonly policy: JsonObject;
  readonly reason: JsonObject;
}

export interface AiToolCallIdentity {
  readonly sessionId: SessionId;
  readonly turn: TurnId;
  readonly step: StepId;
  readonly requestId: RequestId;
  readonly callId: ToolCallId;
  readonly name: string;
  readonly input: unknown;
  readonly contributor: PluginProvenance;
}

export interface AiToolCompletionInput extends AiToolCallIdentity {
  readonly definition: AiToolEntry;
  readonly presentation?: JsonObject;
}

export interface AiToolExecutionInput extends AiToolCompletionInput {
  readonly definition: AiToolDefinition;
  readonly signal?: AbortSignal;
}

export type AiToolExecutionError = {
  readonly name: string;
  readonly code: string;
  readonly message: string;
};

export type AiToolExecutionResult =
  | {
      readonly ok: true;
      readonly output: unknown;
      readonly canonicalOutput: JsonValue;
      readonly modelContent: JsonObject;
    }
  | {
      readonly ok: false;
      readonly error: AiToolExecutionError;
      readonly canonicalOutput: JsonValue;
      readonly modelContent: JsonObject;
    };

export interface AiStandaloneToolExecutionInput {
  readonly backend: string;
  readonly externalRequestId: string;
  readonly rigId?: string;
  readonly name: string;
  readonly input: unknown;
  readonly contributor: PluginProvenance;
  readonly definition: AiToolDefinition;
  readonly signal?: AbortSignal;
  readonly presentation?: JsonObject;
  readonly authorize?: (input: {
    readonly resolution: AiToolApprovalResolution;
    readonly approvalId: ApprovalId;
    readonly sessionId: SessionId;
    readonly callId: ToolCallId;
  }) => Promise<{
    readonly allow: boolean;
    readonly outcome?: "allowed-once" | "allowed-by-policy" | "rejected" | "cancelled" | "unavailable";
    readonly responder?: "user" | "policy" | "parent";
    readonly message?: string;
  }>;
}

export type AiStandaloneToolExecutionResult = AiToolExecutionResult & {
  readonly sessionId: SessionId;
};

/** One execution authority for every model-facing and external tool caller.
 * It owns approval resolution, schema validation, canonical call/result
 * persistence, error normalization, and model-facing output shaping. */
export interface AiToolExecutionCapability {
  resolveApproval(input: {
    readonly definition: AiToolEntry;
    readonly input: unknown;
    readonly mode: AiToolApprovalMode;
  }): Promise<AiToolApprovalResolution>;
  recordCall(input: AiToolCallIdentity & {
    readonly concurrency?: "safe" | "exclusive";
  }): Promise<void>;
  recordApprovalRequest(input: {
    readonly call: AiToolCallIdentity;
    readonly approvalId: ApprovalId;
    readonly resolution: AiToolApprovalResolution;
  }): Promise<void>;
  recordApprovalDecision(input: {
    readonly call: AiToolCallIdentity;
    readonly approvalId: ApprovalId;
    readonly outcome:
      | "allowed-once"
      | "allowed-by-policy"
      | "rejected"
      | "cancelled"
      | "unavailable";
    readonly responder?: "user" | "policy" | "parent";
  }): Promise<void>;
  complete(input: AiToolCompletionInput & {
    readonly output?: unknown;
    readonly error?: AiToolExecutionError;
    readonly startedAt?: number;
  }): Promise<AiToolExecutionResult>;
  execute(input: AiToolExecutionInput): Promise<AiToolExecutionResult>;
  executeStandalone(
    input: AiStandaloneToolExecutionInput,
  ): Promise<AiStandaloneToolExecutionResult>;
}

/** A tool-owned adapter for chat presentation. Tool plugins retain schema and
 * validation ownership while the selected chat plugin retains the visual
 * renderer. The adapter returns a renderer-neutral normalized payload, or
 * `null` when a streamed/malformed value is not ready to render. */
export interface AiToolPresentationAdapter {
  renderer: string;
  interactive: boolean;
  parseInput(input: unknown): unknown | null;
  parseOutput?(output: unknown): unknown | null;
  /** Run an explicit user action exposed by the renderer over canonical tool
   * input/output. The renderer names the action but never imports the owning
   * tool plugin's services or reimplements its transaction rules. */
  performAction?(request: {
    action: string;
    input: unknown;
    output: unknown;
    payload?: unknown;
  }): unknown | PromiseLike<unknown>;
}

export interface AiToolFileMutation {
  kind: "write_file" | "edit" | "multi_edit" | "create_directory";
  path: string;
  originalContent: string;
  proposedContent: string;
  isNewFile: boolean;
  description?: string;
}

export interface AiSessionTodo {
  id: string;
  title: string;
  description?: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
}

/** Session-scoped application runtime supplied to every AI-tool contribution.
 * It exposes shared UI/session state without letting a tool plugin import the
 * chat implementation, renderer stores, or another plugin. Methods are
 * optional because profiles may deliberately omit the corresponding surface;
 * a tool must return a useful unavailable error in that case. */
export interface AiToolRuntime {
  getCwd?(): string | null;
  getWorkspaceRoot?(): string | null;
  getWorkspaceEnv?(): WorkspaceEnv;
  getRigRoot?(): string | null;
  getSessionId?(): string | null;
  /** Read the latest durable completion for one tool in this session. This is
   * intentionally narrower than exposing the session transcript: tools can
   * validate a user-owned interactive decision without learning unrelated
   * conversation state. */
  getLatestCompletedToolCall?(toolName: string): Promise<{
    readonly callId: string;
    readonly input: JsonValue;
    readonly output: JsonValue;
  } | null>;
  /** Session-owned read hashes used by read-before-edit and unchanged reads. */
  readCache?: Map<string, { size: number; hash: number }>;
  /** Plan/review is owned by the active AI session UI, not file-tool plugins. */
  isPlanMode?(): boolean;
  queueFileMutation?(mutation: AiToolFileMutation): void;
  /** Replace the owning session's complete visible task list. */
  replaceTodos?(sessionId: string, todos: readonly AiSessionTodo[]): void;
  setWorkspaceFolder?(cwd: string): void;
  getTerminalContext?(): string | null;
  isActiveTerminalPrivate?(): boolean;
  injectIntoActivePty?(text: string): boolean;
  getActiveViewKind?(): string | null;
  runInTerminal?(
    command: string,
  ): Promise<{ output: string; cwd: string | null } | { error: string }>;
  openPreview?(url: string): boolean;
  getBrowserTabId?(): number | null;
  openBrowser?(url: string): number;
  listBrowserTabs?(): Array<{ id: number; url: string; title: string }>;
  switchBrowserTab?(id: number): boolean;
  closeBrowserTab?(id: number): boolean;
  modelSupportsVision?(): boolean;
  /** Model selected by the owning AI session. Tool plugins read this instead
   * of importing chat stores or duplicating model selection state. */
  getSelectedModelId?(): string | null;
  /** Session-owned progress channel for long-running tools. The session maps
   * this stable shape to its current status line and rich-view protocol. */
  reportProgress?(progress: {
    id: string;
    title: string;
    steps: readonly string[];
    label?: string;
    done?: boolean;
  }): void;
  /** Session-bound managed coding-agent bridge supplied by the active AI
   * session owner. */
  getManagedCodingAgent?(): {
    leafId: number;
    tabId: number;
    phase: "spawning" | "working" | "reviewing" | "done";
    rounds: number;
    maxRounds: number;
  } | null;
  spawnManagedCodingAgent?(prompt: string): {
    tabId: number;
    leafId: number;
  } | null;
  sendManagedCodingAgentInstruction?(instruction: string): Promise<{
    ok: boolean;
    round?: number;
    error?: string;
  }>;
  readManagedCodingAgentOutput?(): string | null;
  listTabs?(): Array<{
    id: number;
    kind: string;
    title: string;
    active: boolean;
  }>;
  focusView?(target: { id?: number; kind?: string }): {
    ok: boolean;
    created?: boolean;
  };
  getMcpTools?(): unknown[];
}

/** Approval policy state owned by the selected browser AI-tool plugin. */
export interface AiBrowserPolicyCapability {
  allowCurrentOrigin(sessionId: string, tabId: number): Promise<string | null>;
}

/** A lazily built AI tool fragment. The context is supplied per chat/session
 * by the selected `ai.sessions` consumer, so plugins never own duplicate chat
 * state merely to contribute tools. */
export interface AiToolContribution {
  id: string;
  group: string;
  order?: number;
  /** Presentation adapters keyed by the tool name they normalize. */
  presentations?: Readonly<Record<string, AiToolPresentationAdapter>>;
  build(toolContext: AiToolRuntime): Record<string, AiToolEntry>;
}

/** Reusable named tool definitions. Unlike `ai.tools`, these entries are not
 * exposed directly to the main chat. Orchestrator plugins consume them to
 * assemble restricted toolsets without importing another plugin's source. */
export type AiToolsetContribution = AiToolContribution;

export interface AiToolRegistry {
  register(entry: AiToolContribution): Dispose;
  snapshot(): readonly AiToolContribution[];
  subscribe(listener: () => void): Dispose;
}

export interface AiToolsetRegistry {
  register(entry: AiToolsetContribution): Dispose;
  snapshot(): readonly AiToolsetContribution[];
  subscribe(listener: () => void): Dispose;
}

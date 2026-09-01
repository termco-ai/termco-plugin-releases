import { Chat, type UIMessage } from "@ai-sdk/react";
import {
  convertToModelMessages,
  isToolUIPart,
  jsonSchema,
  toUIMessageStream,
  tool,
  type ChatTransport,
} from "ai";
import type {
  AiInferenceCapability,
  AiInferenceStreamStep,
} from "@termco/ai-inference-base";
import type { AiToolGroupId } from "@termco/ai-library-base";
import {
  type AiToolContribution,
  type AiToolDefinition,
  type AiToolEntry,
  type AiToolExecutionCapability,
  type AiToolExecutionError,
  type AiToolExecutionResult,
  type AiToolRuntime,
} from "@termco/ai-tools-base";
import type { WorkspaceRigsCapability } from "@termco/workspace-base";
import {
  ApprovalId,
  SessionId,
  ToolCallId,
  type AppendSessionEvent,
  type JsonObject,
  type JsonValue,
  type PluginProvenance,
} from "@termco/session-base";
import {
  abortChatTurn,
  appendSessionEvents,
  appendSessionDiagnostic,
  beginOwnedChatRequest,
  beginNextChatStep,
  cancelSuspendedChatTurn,
  effectiveReasoningEffort,
  ensureOwnedSession,
  failChatTurn,
  prepareOwnedSessionForContinuation,
  providerModelIdForSelection,
  readOwnedSuspension,
  readLatestCompletedToolCall,
  resolveAvailableModel,
  settleChatProviderEnd,
  type ChatTurnHandle,
} from "./runtime";
import { waitForToolPresentation } from "./toolPresentation";
import {
  createRetryingInferenceStream,
  isInferenceRequestFailure,
} from "./requestRetry";
import { chats, seedMessages, toolContexts, touchChat } from "./store/registry";
import { useChatStore } from "./store/store";
import { shouldResumeOwnedChat } from "./autoSend";
import {
  enabledSkillsFor,
  mcpToolsFor,
  selectedAgent,
} from "./baseline/store/agentsStore";
import { usePreferencesStore } from "./baseline/runtime/preferences";
import {
  buildProviderPrompt,
  buildStableSystemPrompt,
} from "./baseline/config/prompts";
import {
  formatEnvBlock,
  injectEnvIntoLastUser,
} from "./baseline/lib/transport/envContext";
import { readProjectMemory } from "./baseline/lib/transport/projectMemory";
import { sanitizeHistoryForModel } from "./baseline/lib/agent/modelHistoryPortability";
import {
  buildErrorMessage,
  type ErrorDetail,
} from "./baseline/lib/agent/errorMessage";
import {
  newQueuedEditId,
  usePlanStore,
} from "./baseline/store/planStore";
import { noteStreamError } from "./baseline/store/chatRuntime/overflow";
import { useTodosStore } from "./baseline/store/todoStore";
import {
  createToolDisclosure,
  TOOL_SEARCH_NAME,
} from "./toolDisclosure";

let inference: AiInferenceCapability | null = null;
let contributions: readonly AiToolContribution[] = [];
let toolExecution: AiToolExecutionCapability | null = null;
let workspaceRigs: WorkspaceRigsCapability | null = null;

export function chatRuntimeActive(): boolean {
  return inference !== null || contributions.length > 0 || toolExecution !== null || workspaceRigs !== null;
}

export function configureChatRuntime(input: {
  inference: AiInferenceCapability;
  tools: readonly AiToolContribution[];
  toolExecution: AiToolExecutionCapability;
  workspaceRigs: WorkspaceRigsCapability;
}): () => void {
  inference = input.inference;
  contributions = input.tools;
  toolExecution = input.toolExecution;
  workspaceRigs = input.workspaceRigs;
  return () => {
    if (inference === input.inference) inference = null;
    if (contributions === input.tools) contributions = [];
    if (toolExecution === input.toolExecution) toolExecution = null;
    if (workspaceRigs === input.workspaceRigs) workspaceRigs = null;
  };
}

function selectedToolExecution(): AiToolExecutionCapability {
  if (!toolExecution) throw new Error("AI tool execution provider is not active");
  return toolExecution;
}

function selectedInference(): AiInferenceCapability {
  if (!inference) throw new Error("AI inference provider is not active");
  return inference;
}

function sessionRigId(sessionId: string): string | undefined {
  return useChatStore
    .getState()
    .sessions.find((session) => session.id === sessionId)?.rigId;
}

function effectiveModelId(): string {
  return selectedAgent()?.model?.trim() || useChatStore.getState().selectedModelId;
}

const E2E_TOOL_SESSION_ID = "__termco-e2e-tool-inspection";
const e2eCompletedInteractiveTools = new Map<string, {
  callId: string;
  input: JsonValue;
  output: JsonValue;
}>();

function sessionWorkspace(sessionId: string) {
  const snapshot = workspaceRigs?.snapshot();
  const rigId = sessionRigId(sessionId);
  return snapshot?.rigs.find((candidate) => candidate.id === rigId) ??
    snapshot?.rigs.find((candidate) => candidate.id === snapshot.activeId);
}

function toolRuntime(sessionId: string): AiToolRuntime {
  const readCache = new Map<string, { size: number; hash: number }>();
  const runtime: AiToolRuntime = {
    getSessionId: () => sessionId,
    getLatestCompletedToolCall: (toolName) =>
      sessionId === E2E_TOOL_SESSION_ID
        ? Promise.resolve(e2eCompletedInteractiveTools.get(toolName) ?? null)
        : readLatestCompletedToolCall(sessionId, toolName),
    readCache,
    isPlanMode: () => usePlanStore.getState().active,
    queueFileMutation: (mutation) => usePlanStore.getState().enqueue({
      ...mutation,
      id: newQueuedEditId(),
    }),
    getCwd: () => useChatStore.getState().live.getCwd(sessionRigId(sessionId)),
    getWorkspaceRoot: () =>
      sessionWorkspace(sessionId)?.root ??
      useChatStore.getState().live.getWorkspaceRoot(),
    getRigRoot: () =>
      sessionWorkspace(sessionId)?.root ??
      useChatStore.getState().live.getWorkspaceRoot(),
    getWorkspaceEnv: () => sessionWorkspace(sessionId)?.workspace ?? { kind: "local" },
    getTerminalContext: () =>
      useChatStore.getState().live.getTerminalContext(sessionRigId(sessionId)),
    isActiveTerminalPrivate: () =>
      useChatStore.getState().live.isActiveTerminalPrivate(sessionRigId(sessionId)),
    injectIntoActivePty: (text) =>
      useChatStore.getState().live.injectIntoActivePty(text, sessionRigId(sessionId)),
    runInTerminal: (command) =>
      useChatStore.getState().live.runInActiveTerminal(command, sessionRigId(sessionId)),
    getActiveViewKind: () => useChatStore.getState().live.getActiveKind(),
    setWorkspaceFolder: (cwd) => useChatStore.getState().live.setAgentCwd(cwd),
    openPreview: (url) => useChatStore.getState().live.openPreview(url),
    getBrowserTabId: () =>
      useChatStore.getState().live.getBrowserTabId(sessionRigId(sessionId)),
    openBrowser: (url) =>
      useChatStore.getState().live.openBrowser(url, sessionRigId(sessionId)),
    listBrowserTabs: () =>
      useChatStore.getState().live.listBrowserTabs(sessionRigId(sessionId)),
    switchBrowserTab: (id) => useChatStore.getState().live.switchBrowserTab(id),
    closeBrowserTab: (id) => useChatStore.getState().live.closeBrowserTab(id),
    getSelectedModelId: effectiveModelId,
    modelSupportsVision: () =>
      resolveAvailableModel(effectiveModelId())?.tags?.includes("vision") ?? false,
    getMcpTools: () => {
      const snapshot = workspaceRigs?.snapshot();
      const rigId = sessionRigId(sessionId);
      const rig = snapshot?.rigs.find((candidate) => candidate.id === rigId) ??
        snapshot?.rigs.find((candidate) => candidate.id === snapshot.activeId);
      return mcpToolsFor(
        rig?.root ?? useChatStore.getState().live.getWorkspaceRoot(),
        rig?.workspace ?? { kind: "local" },
      );
    },
    replaceTodos: (ownerSessionId, todos) =>
      useTodosStore.getState().setTodos(ownerSessionId, [...todos]),
    reportProgress: (progress) => {
      useChatStore.getState().patchAgentMeta({
        status: progress.done ? "streaming" : "thinking",
        step: progress.label ?? progress.title,
      });
    },
    getManagedCodingAgent: () =>
      useChatStore.getState().live.getManagedAgent?.(sessionId) ?? null,
    spawnManagedCodingAgent: (prompt) =>
      useChatStore.getState().live.spawnManagedAgent(prompt, sessionId),
    sendManagedCodingAgentInstruction: (instruction) =>
      useChatStore.getState().live.sendManagedAgentInstruction?.(
        sessionId,
        instruction,
      ) ?? Promise.resolve({ ok: false, error: "managed agent input is unavailable" }),
    readManagedCodingAgentOutput: () =>
      useChatStore.getState().live.readManagedAgentOutput?.(sessionId) ?? null,
    listTabs: () => useChatStore.getState().live.listTabs(sessionRigId(sessionId)),
    focusView: (target) =>
      useChatStore.getState().live.focusView(target, sessionRigId(sessionId)),
  };
  toolContexts.set(sessionId, runtime);
  return runtime;
}

export function buildSessionToolDefinitions(
  runtime: AiToolRuntime,
): Record<string, AiToolEntry> {
  const definitions: Record<string, AiToolEntry> = {};
  for (const contribution of contributions) {
    Object.assign(definitions, contribution.build(runtime));
  }
  return definitions;
}

type SessionToolRegistry = {
  definitions: Record<string, AiToolEntry>;
  groups: Map<string, string>;
  contributors: Map<string, PluginProvenance>;
};

function buildSessionToolRegistry(runtime: AiToolRuntime): SessionToolRegistry {
  const definitions: Record<string, AiToolEntry> = {};
  const groups = new Map<string, string>();
  const contributorsByTool = new Map<string, PluginProvenance>();
  for (const contribution of contributions) {
    const built = contribution.build(runtime);
    Object.assign(definitions, built);
    for (const name of Object.keys(built)) {
      groups.set(name, contribution.group);
      contributorsByTool.set(name, {
        pluginId: contribution.id,
        contributionId: contribution.id,
      });
    }
  }
  return { definitions, groups, contributors: contributorsByTool };
}

export function activeSkillFromSteps(
  steps: readonly AiInferenceStreamStep[],
): { allowedGroups?: readonly AiToolGroupId[] } | null {
  let active: { allowedGroups?: readonly AiToolGroupId[] } | null = null;
  for (const step of steps) {
    for (const result of step.toolResults ?? []) {
      if (result.toolName !== "skill" || !result.output || typeof result.output !== "object") {
        continue;
      }
      const output = result.output as {
        ok?: boolean;
        deactivated?: boolean;
        skill?: string;
        allowedGroups?: readonly AiToolGroupId[];
      };
      if (!output.ok) continue;
      if (output.deactivated) active = null;
      else if (output.skill) active = { allowedGroups: output.allowedGroups };
    }
  }
  return active;
}

function e2eToolDefinitions(): Record<string, AiToolEntry> {
  const sessionId = E2E_TOOL_SESSION_ID;
  try {
    return buildSessionToolDefinitions(toolRuntime(sessionId));
  } finally {
    toolContexts.delete(sessionId);
  }
}

export function completeE2EInteractiveTool(
  name: string,
  input: JsonValue,
  output: JsonValue,
): string {
  const callId = `e2e-${name}-${crypto.randomUUID()}`;
  e2eCompletedInteractiveTools.set(name, { callId, input, output });
  return callId;
}

export function inspectE2EToolDefinitions(): Record<
  string,
  { description: string }
> {
  return Object.fromEntries(
    Object.entries(e2eToolDefinitions()).map(([name, definition]) => [
      name,
      { description: definition.description ?? "" },
    ]),
  );
}

export function inspectE2EInferenceConfiguration() {
  return selectedInference().configuration();
}

export async function invokeE2ETool(
  name: string,
  input: unknown,
): Promise<unknown> {
  const definition = e2eToolDefinitions()[name];
  if (!definition) throw new Error(`unknown AI tool: ${name}`);
  if (!definition.execute) throw new Error(`AI tool is not executable: ${name}`);
  const result = await selectedToolExecution().executeStandalone({
    backend: "e2e-tool",
    externalRequestId: crypto.randomUUID(),
    name,
    input,
    contributor: { pluginId: "ai-chat-native", contributionId: name },
    definition,
    authorize: async () => ({
      allow: true,
      outcome: "allowed-once",
      responder: "user",
    }),
  });
  if (result.ok) return result.output;
  throw Object.assign(new Error(result.error.message), result.error);
}

export async function inspectE2EEffectiveToolApproval(
  name: string,
  input: unknown,
): Promise<boolean> {
  const definition = e2eToolDefinitions()[name];
  if (!definition) throw new Error(`unknown AI tool: ${name}`);
  const resolution = await selectedToolExecution().resolveApproval({
    definition,
    input,
    mode: usePreferencesStore.getState().agentAutoApprove
      ? "allow-safe"
      : "ask",
  });
  return resolution.action === "ask";
}

export async function respondToOwnedInteractiveTool(
  input: {
    readonly sessionId: string;
    readonly toolName: string;
    readonly toolCallId: string;
    readonly output: unknown;
  },
  publish: () => void | PromiseLike<void>,
): Promise<void> {
  const suspension = await readOwnedSuspension(input.sessionId);
  if (!suspension) {
    throw new Error(`session ${input.sessionId} is not waiting for human input`);
  }
  const call = suspension.calls.find((candidate) =>
    String(candidate.callId) === input.toolCallId
  );
  if (!call || call.name !== input.toolName) {
    throw new Error(
      `tool ${input.toolName} call ${input.toolCallId} is not pending in session ${input.sessionId}`,
    );
  }
  const registry = buildSessionToolRegistry(toolRuntime(input.sessionId));
  const definition = registry.definitions[input.toolName];
  if (!definition || definition.execute) {
    throw new Error(`tool ${input.toolName} is not an interactive tool`);
  }
  const result = await selectedToolExecution().complete({
    ...call,
    definition,
    output: input.output,
  });
  if (!result.ok) throw Object.assign(new Error(result.error.message), result.error);
  await publish();
}

export async function respondToOwnedApproval(
  input: {
    readonly sessionId: string;
    readonly approvalId: string;
    readonly approved: boolean;
  },
  publish: () => void | PromiseLike<void>,
): Promise<void> {
  const suspension = await readOwnedSuspension(input.sessionId);
  if (!suspension) {
    throw new Error(`session ${input.sessionId} is not waiting for human input`);
  }
  const approval = suspension.approvals.find((candidate) =>
    String(candidate.approvalId) === input.approvalId
  );
  if (!approval) {
    throw new Error(
      `approval ${input.approvalId} is not pending in session ${input.sessionId}`,
    );
  }
  const call = suspension.calls.find((candidate) =>
    String(candidate.callId) === String(approval.callId)
  );
  if (!call) {
    throw new Error(
      `approval ${input.approvalId} has no owning call in session ${input.sessionId}`,
    );
  }
  const execution = selectedToolExecution();
  await execution.recordApprovalDecision({
    call,
    approvalId: approval.approvalId,
    outcome: input.approved ? "allowed-once" : "rejected",
    responder: "user",
  });
  const registry = buildSessionToolRegistry(toolRuntime(input.sessionId));
  const currentDefinition = registry.definitions[call.name];
  if (input.approved && currentDefinition?.execute) {
    await executeAfterToolPresentation(String(call.callId), () =>
      execution.execute({
        ...call,
        definition: currentDefinition,
      })
    );
  } else {
    const definition = currentDefinition ?? {
      description: `Unavailable tool ${call.name}`,
      inputSchema: { type: "object" },
    };
    await execution.complete({
      ...call,
      definition,
      error: {
        name: input.approved ? "ToolUnavailable" : "ToolApprovalRejected",
        code: input.approved ? "TOOL_UNAVAILABLE" : "TOOL_DENIED",
        message: input.approved
          ? `Approved tool ${call.name} is no longer available`
          : "The user rejected this tool call",
      },
    });
  }
  // Settle the canonical call before publishing the response. A later AI SDK
  // replay is safe: the central executor single-flights the same call identity
  // and returns its durable terminal result without repeating the side effect.
  await publish();
}

export async function executeAfterToolPresentation<T>(
  toolCallId: string,
  execute: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await waitForToolPresentation(toolCallId, signal);
  return execute();
}

type SessionToolCall = Parameters<AiToolExecutionCapability["recordCall"]>[0];

export function createToolCallHandleResolver(
  currentHandle: () => ChatTurnHandle,
  existingCalls: readonly SessionToolCall[],
): (toolCallId: string) => ChatTurnHandle {
  const existing = new Map(existingCalls.map((call) => [
    String(call.callId),
    { turn: call.turn, step: call.step, requestId: call.requestId },
  ]));
  return (toolCallId) => existing.get(toolCallId) ?? currentHandle();
}

function adaptSessionTools(
  registry: SessionToolRegistry,
  sessionId: string,
  handleForCall: (toolCallId: string) => ChatTurnHandle,
  autoRun = false,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(registry.definitions).map(([name, definition]) => {
      const execution = selectedToolExecution();
      const sdkDefinition: Record<string, unknown> = {
        ...(definition.description ? { description: definition.description } : {}),
        inputSchema: jsonSchema(definition.inputSchema),
        ...(definition.toModelOutput ? { toModelOutput: definition.toModelOutput } : {}),
        needsApproval: async (input: unknown) => {
          const resolution = await execution.resolveApproval({
            definition,
            input,
            mode: autoRun ? "allow-safe" : "ask",
          });
          return resolution.action !== "allow";
        },
      };
      if (definition.execute) {
        sdkDefinition.execute = async (
          input: unknown,
          options: { toolCallId: string; abortSignal?: AbortSignal },
        ) => {
          const handle = handleForCall(options.toolCallId);
          const result = await executeAfterToolPresentation(options.toolCallId, () => execution.execute({
            sessionId: SessionId(sessionId),
            ...handle,
            callId: ToolCallId(options.toolCallId),
            name,
            input,
            contributor: registry.contributors.get(name) ?? {
              pluginId: "ai-chat-native",
              contributionId: name,
            },
            definition: definition as AiToolDefinition,
            ...(options.abortSignal ? { signal: options.abortSignal } : {}),
          }), options.abortSignal);
          return modelValueForSessionToolResult(result);
        };
      }
      return [name, tool(sdkDefinition as never)];
    }),
  );
}

export function modelValueForSessionToolResult(
  result: AiToolExecutionResult,
): unknown {
  return result.ok ? result.output : result.canonicalOutput;
}

export function buildSessionTools(runtime: AiToolRuntime): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(buildSessionToolDefinitions(runtime)).map(([name, definition]) => [
      name,
      tool({
        ...(definition.description ? { description: definition.description } : {}),
        inputSchema: jsonSchema(definition.inputSchema),
      } as never),
    ]),
  );
}

type SessionDiagnostic = {
  kind: string;
  payload: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function sessionJson(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue;
}

function sessionJsonObject(value: unknown): JsonObject {
  const encoded = sessionJson(value);
  return typeof encoded === "object" && encoded !== null && !Array.isArray(encoded)
    ? encoded as JsonObject
    : { value: encoded };
}

function toolCallOf(value: Record<string, unknown>): Record<string, unknown> {
  return record(value.toolCall ?? value);
}

export function createSessionStepPersistenceGate(): {
  beforeStep(stepNumber: number): Promise<void>;
  partPersisted(part: unknown): void;
} {
  let persistedSteps = 0;
  const waiters = new Map<number, Set<() => void>>();

  return {
    beforeStep(stepNumber) {
      if (stepNumber <= persistedSteps) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const pending = waiters.get(stepNumber) ?? new Set<() => void>();
        pending.add(resolve);
        waiters.set(stepNumber, pending);
      });
    },
    partPersisted(part) {
      if (record(part).type !== "finish-step") return;
      persistedSteps += 1;
      for (const [stepNumber, pending] of waiters) {
        if (stepNumber > persistedSteps) continue;
        waiters.delete(stepNumber);
        for (const resolve of pending) resolve();
      }
    },
  };
}

export function createSessionTurnClosureGate(): {
  beforeOpen(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  open(
    sessionId: string,
    stopWork?: () => Promise<void>,
  ): { close(work: () => Promise<void>): Promise<void> };
} {
  const active = new Map<string, {
    readonly done: Promise<void>;
    resolve(): void;
    reject(error: unknown): void;
    stopWork?: () => Promise<void>;
    closePromise?: Promise<void>;
  }>();
  return {
    async beforeOpen(sessionId) {
      await active.get(sessionId)?.done;
    },
    async stop(sessionId) {
      const state = active.get(sessionId);
      if (!state) return;
      if (!state.closePromise) {
        if (!state.stopWork) {
          throw new Error(`session ${sessionId} has no Stop closure`);
        }
        state.closePromise = state.stopWork().then(
          () => {
            if (active.get(sessionId) === state) active.delete(sessionId);
            state.resolve();
          },
          (error) => {
            state.reject(error);
            throw error;
          },
        );
      }
      await state.closePromise;
    },
    open(sessionId, stopWork) {
      if (active.has(sessionId)) {
        throw new Error(`session ${sessionId} already has an active turn closure`);
      }
      let resolve!: () => void;
      let reject!: (error: unknown) => void;
      const done = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      // A failed closure remains registered so later sends observe the durable
      // write failure instead of opening another canonical turn.
      void done.catch(() => undefined);
      const state = { done, resolve, reject, stopWork } as {
        readonly done: Promise<void>;
        resolve(): void;
        reject(error: unknown): void;
        stopWork?: () => Promise<void>;
        closePromise?: Promise<void>;
      };
      active.set(sessionId, state);
      return {
        close(work) {
          if (state.closePromise) return state.closePromise;
          state.closePromise = work().then(
            () => {
              if (active.get(sessionId) === state) active.delete(sessionId);
              state.resolve();
            },
            (error) => {
              state.reject(error);
              throw error;
            },
          );
          return state.closePromise;
        },
      };
    },
  };
}

const sessionTurnClosures = createSessionTurnClosureGate();

export interface SessionHumanInputWait {
  readonly callIds: readonly string[];
  readonly approvalIds: readonly string[];
}

export function createSessionStreamRecorder(
  handleInput: ChatTurnHandle | (() => ChatTurnHandle),
  options: {
    readonly sessionId: string;
    readonly definitions: Readonly<Record<string, AiToolEntry>>;
    readonly execution: AiToolExecutionCapability;
    readonly contributors: ReadonlyMap<string, PluginProvenance>;
    readonly approvalPolicy: JsonObject;
    readonly initialCalls?: readonly Parameters<AiToolExecutionCapability["recordCall"]>[0][];
  },
): {
  record(part: unknown): Promise<readonly AppendSessionEvent[]>;
  waiting(): SessionHumanInputWait | null;
  terminateWaiting(
    error: AiToolExecutionError,
    approvalOutcome: "cancelled" | "unavailable",
  ): Promise<void>;
} {
  const calls = new Map<string, {
    call: Parameters<AiToolExecutionCapability["recordCall"]>[0];
    definition: AiToolEntry;
  }>();
  for (const call of options.initialCalls ?? []) {
    const definition = options.definitions[call.name];
    if (!definition) continue;
    calls.set(String(call.callId), {
      call: {
        ...call,
        concurrency: definition.concurrency === "safe" ? "safe" : "exclusive",
      },
      definition,
    });
  }
  const automaticApprovals = new Map<string, boolean>();
  const approvalCalls = new Map<string, ReturnType<typeof calls.get>>();
  const humanCallIds = new Set<string>();
  const humanApprovalIds = new Set<string>();
  const currentHandle = (): ChatTurnHandle =>
    typeof handleInput === "function" ? handleInput() : handleInput;

  const toolCall = (value: Record<string, unknown>) => {
    const call = toolCallOf(value);
    const callId = typeof call.toolCallId === "string" ? call.toolCallId : "";
    const name = typeof call.toolName === "string" ? call.toolName : "";
    if (!callId || !name) return null;
    const existing = calls.get(callId);
    if (existing) return existing;
    const definition = options.definitions[name];
    if (!definition) return null;
    const handle = currentHandle();
    const tracked = {
      call: {
        sessionId: SessionId(options.sessionId),
        ...handle,
        callId: ToolCallId(callId),
        name,
        input: call.input,
        contributor: options.contributors.get(name) ?? {
          pluginId: "ai-chat-native",
          contributionId: name,
        },
        concurrency: definition.concurrency === "safe" ? "safe" as const : "exclusive" as const,
      },
      definition,
    };
    calls.set(callId, tracked);
    return tracked;
  };

  const recordPart = async (part: unknown): Promise<readonly AppendSessionEvent[]> => {
    const value = record(part);
    const handle = currentHandle();
    switch (value.type) {
      case "text-delta":
      case "reasoning-delta":
        return [{
          type: "assistant/chunk",
          time: Date.now(),
          data: {
            ...handle,
            chunk: sessionJsonObject({
              kind: value.type,
              id: value.id ?? null,
              delta: value.text ?? "",
            }),
          },
        }];
      case "tool-call": {
        const tracked = toolCall(value);
        if (tracked) {
          await options.execution.recordCall(tracked.call);
          if (!tracked.definition.execute) humanCallIds.add(String(tracked.call.callId));
        }
        return [];
      }
      case "tool-approval-request": {
        const call = toolCallOf(value);
        const callId = typeof call.toolCallId === "string" ? call.toolCallId : "";
        const approvalId = typeof value.approvalId === "string" ? value.approvalId : "";
        if (!callId || !approvalId) return [];
        const tracked = toolCall(value);
        if (!tracked) return [];
        const automatic = value.isAutomatic === true;
        automaticApprovals.set(approvalId, automatic);
        approvalCalls.set(approvalId, tracked);
        const resolution = await options.execution.resolveApproval({
          definition: tracked.definition,
          input: tracked.call.input,
          mode: options.approvalPolicy.mode === "allow-safe" ? "allow-safe" : "ask",
        });
        await options.execution.recordApprovalRequest({
          call: tracked.call,
          approvalId: ApprovalId(approvalId),
          resolution,
        });
        if (resolution.action === "ask") {
          humanCallIds.add(callId);
          humanApprovalIds.add(approvalId);
        }
        return [];
      }
      case "tool-approval-response": {
        const call = toolCallOf(value);
        const callId = typeof call.toolCallId === "string" ? call.toolCallId : "";
        const approvalId = typeof value.approvalId === "string" ? value.approvalId : "";
        if (!callId || !approvalId) return [];
        const automatic = automaticApprovals.get(approvalId) === true;
        automaticApprovals.delete(approvalId);
        approvalCalls.delete(approvalId);
        const tracked = calls.get(callId) ?? toolCall(value);
        if (!tracked) return [];
        await options.execution.recordApprovalDecision({
          call: tracked.call,
          approvalId: ApprovalId(approvalId),
          outcome: value.approved === true
            ? (automatic ? "allowed-by-policy" : "allowed-once")
            : "rejected",
          responder: automatic ? "policy" : "user",
        });
        humanApprovalIds.delete(approvalId);
        // Once an executable call is approved, the executor owns its terminal
        // result again. Keeping it in the human-wait set would make turn close
        // cancel an already successful side effect with a conflicting result.
        if (value.approved === true && tracked.definition.execute) {
          humanCallIds.delete(callId);
        }
        return [];
      }
      case "tool-result": {
        if (value.preliminary === true) return [];
        const callId = typeof value.toolCallId === "string" ? value.toolCallId : "";
        const tracked = calls.get(callId);
        if (!tracked || tracked.definition.execute) return [];
        await options.execution.complete({
          ...tracked.call,
          definition: tracked.definition,
          output: value.output,
        });
        humanCallIds.delete(callId);
        return [];
      }
      case "tool-error": {
        const callId = typeof value.toolCallId === "string" ? value.toolCallId : "";
        const tracked = calls.get(callId) ?? toolCall(value);
        if (!tracked) return [];
        const detail = value.error && typeof value.error === "object"
          ? value.error as { name?: unknown; code?: unknown; message?: unknown }
          : {};
        await options.execution.complete({
          ...tracked.call,
          definition: tracked.definition,
          error: {
            name: typeof detail.name === "string" ? detail.name : "ToolExecutionError",
            code: typeof detail.code === "string" ? detail.code : "TOOL_FAILED",
            message: typeof detail.message === "string"
              ? detail.message
              : String(value.error ?? "tool failed"),
          },
        });
        humanCallIds.delete(callId);
        return [];
      }
      case "tool-output-denied": {
        const callId = typeof value.toolCallId === "string" ? value.toolCallId : "";
        const tracked = calls.get(callId) ?? toolCall(value);
        if (!tracked) return [];
        await options.execution.complete({
          ...tracked.call,
          definition: tracked.definition,
          error: {
            name: "ToolApprovalRejected",
            code: "TOOL_DENIED",
            message: "tool execution was denied",
          },
        });
        humanCallIds.delete(callId);
        return [];
      }
      default:
        return [];
    }
  };
  return {
    record: recordPart,
    waiting() {
      if (humanCallIds.size === 0 && humanApprovalIds.size === 0) return null;
      return {
        callIds: [...humanCallIds].sort(),
        approvalIds: [...humanApprovalIds].sort(),
      };
    },
    async terminateWaiting(error, approvalOutcome) {
      for (const approvalId of [...humanApprovalIds].sort()) {
        const tracked = approvalCalls.get(approvalId);
        if (!tracked) {
          throw new Error(`Pending approval ${approvalId} has no tracked call`);
        }
        await options.execution.recordApprovalDecision({
          call: tracked.call,
          approvalId: ApprovalId(approvalId),
          outcome: approvalOutcome,
          responder: "parent",
        });
        humanApprovalIds.delete(approvalId);
        approvalCalls.delete(approvalId);
      }
      for (const callId of [...humanCallIds].sort()) {
        const tracked = calls.get(callId);
        if (!tracked) throw new Error(`Pending tool call ${callId} is not tracked`);
        await options.execution.complete({
          ...tracked.call,
          definition: tracked.definition,
          error,
        });
        humanCallIds.delete(callId);
      }
    },
  };
}

/** Preserve provider-neutral streaming details without making them Chat's
 * restoration authority; completed messages are canonical surface events. */
export function sessionDiagnosticForStreamPart(part: unknown): SessionDiagnostic | null {
  const value = record(part);
  switch (value.type) {
    case "text-delta":
      return {
        kind: "stream-text-delta",
        payload: { id: value.id, delta: value.text },
      };
    case "reasoning-delta":
      return {
        kind: "stream-reasoning-delta",
        payload: { id: value.id, delta: value.text },
      };
    case "tool-call":
      return {
        kind: "stream-tool-call",
        payload: {
          toolName: value.toolName,
          toolCallId: value.toolCallId,
          input: value.input,
          dynamic: value.dynamic === true,
        },
      };
    case "tool-result":
      return {
        kind: "stream-tool-result",
        payload: {
          toolName: value.toolName,
          toolCallId: value.toolCallId,
          output: value.output,
          preliminary: value.preliminary === true,
        },
      };
    case "tool-error":
      return {
        kind: "stream-tool-error",
        payload: {
          toolName: value.toolName,
          toolCallId: value.toolCallId,
          error:
            value.error instanceof Error
              ? value.error.message
              : String(value.error ?? "tool failed"),
        },
      };
    case "finish":
      return {
        kind: "stream-finish",
        payload: { finishReason: value.finishReason ?? null },
      };
    case "abort":
      return {
        kind: "stream-abort",
        payload: { finishReason: "abort", reason: value.reason ?? null },
      };
    case "error":
      return {
        kind: "stream-error",
        payload: {
          finishReason: "error",
          error:
            value.error instanceof Error
              ? value.error.message
              : String(value.error ?? "stream failed"),
        },
      };
    default:
      return null;
  }
}

export function recordedStream(
  sessionId: string,
  stream: unknown,
  mapEvents: (part: unknown) => Promise<readonly AppendSessionEvent[]>,
  onPartPersisted?: (part: unknown) => void,
): unknown {
  const readable = stream as ReadableStream<unknown> | null;
  if (!readable || typeof readable.pipeThrough !== "function") return stream;
  let recording = Promise.resolve();
  let persistence = Promise.resolve();
  let persistenceFailure: unknown;
  let chunkTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingChunkEvents: AppendSessionEvent[] = [];
  let pendingChunkParts: unknown[] = [];

  const enqueuePersistence = (work: () => Promise<void>) => {
    persistence = persistence.then(async () => {
      if (persistenceFailure !== undefined) return;
      await work();
    }).catch((error: unknown) => {
      persistenceFailure ??= error;
    });
  };

  const flushChunkBatch = () => {
    if (chunkTimer !== null) {
      clearTimeout(chunkTimer);
      chunkTimer = null;
    }
    if (pendingChunkEvents.length === 0) return;
    const events = pendingChunkEvents;
    const parts = pendingChunkParts;
    pendingChunkEvents = [];
    pendingChunkParts = [];
    enqueuePersistence(async () => {
      await appendSessionEvents(sessionId, events);
      for (const part of parts) onPartPersisted?.(part);
    });
  };

  const queueChunkBatch = (
    part: unknown,
    events: readonly AppendSessionEvent[],
  ) => {
    pendingChunkEvents.push(...events);
    pendingChunkParts.push(part);
    if (pendingChunkEvents.length >= 32) {
      flushChunkBatch();
      return;
    }
    chunkTimer ??= setTimeout(flushChunkBatch, 50);
  };

  const enqueueRecording = (part: unknown) => {
    recording = recording.then(async () => {
      if (persistenceFailure !== undefined) return;
      const events = await mapEvents(part);
      if (
        events.length > 0 &&
        events.every((event) => event.type === "assistant/chunk")
      ) {
        queueChunkBatch(part, events);
        return;
      }
      flushChunkBatch();
      enqueuePersistence(async () => {
        if (events.length > 0) {
          await appendSessionEvents(sessionId, events);
        } else {
          const event = sessionDiagnosticForStreamPart(part);
          if (event) {
            await appendSessionDiagnostic(sessionId, event.kind, event.payload);
          }
        }
        onPartPersisted?.(part);
      });
    }).catch((error: unknown) => {
      persistenceFailure ??= error;
    });
  };

  return readable.pipeThrough(
    new TransformStream<unknown, unknown>({
      transform(part, controller) {
        // Chat owns the provider stream. Trajectory mapping and persistence
        // observe that stream on an ordered side channel and can never apply
        // backpressure to the user's visible response.
        controller.enqueue(part);
        enqueueRecording(part);
      },
      async flush() {
        await recording;
        flushChunkBatch();
        await persistence;
        if (persistenceFailure !== undefined) throw persistenceFailure;
      },
    }),
  );
}

export function describeSessionTools(
  definitions: Record<string, AiToolEntry>,
  contributors: ReadonlyMap<string, PluginProvenance>,
): Array<{
  name: string;
  description?: string;
  schema: Record<string, unknown>;
  contributor: PluginProvenance;
}> {
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    description: definition.description,
    schema: definition.inputSchema,
    contributor: contributors.get(name) ?? {
      pluginId: "ai-chat-native",
      contributionId: name,
    },
  }));
}

export function createProviderTransport(
  sessionId: string,
): ChatTransport<UIMessage> {
  const runtime = toolRuntime(sessionId);
  return {
    async sendMessages(options) {
      await sessionTurnClosures.beforeOpen(sessionId);
      const agent = selectedAgent();
      const preferences = usePreferencesStore.getState();
      const registry = buildSessionToolRegistry(runtime);
      const disclosure = createToolDisclosure({
        definitions: registry.definitions,
        groups: registry.groups,
        preferredGroups: agent?.preferredToolGroups,
        hiddenGroups: preferences.richChatUi ? [] : ["ui"],
      });
      registry.definitions[TOOL_SEARCH_NAME] = disclosure.toolSearchDefinition;
      registry.groups.set(TOOL_SEARCH_NAME, "core");
      registry.contributors.set(TOOL_SEARCH_NAME, {
        pluginId: "ai-chat-native",
        contributionId: "tool-disclosure",
      });
      const definitions = registry.definitions;
      const initialActiveTools = disclosure.activeToolNames();
      let activeTurnHandle: ChatTurnHandle | null = null;
      const modelId = effectiveModelId();
      const model = resolveAvailableModel(modelId, preferences.customEndpoints);
      const reasoningEffort = model
        ? effectiveReasoningEffort(
            model,
            preferences.reasoningByModel[modelId],
          )
        : "off";
      const last = options.messages.at(-1);
      const session = useChatStore
        .getState()
        .sessions.find((entry) => entry.id === sessionId);
      await ensureOwnedSession(sessionId, {
        title: session?.title ?? "New chat",
        ...(session?.rigId ? { rigId: session.rigId } : {}),
        ...(session?.createdAt ? { createdAt: session.createdAt } : {}),
      });
      await prepareOwnedSessionForContinuation(sessionId);
      const resumedSuspension = await readOwnedSuspension(sessionId);
      const tools = adaptSessionTools(
        registry,
        sessionId,
        createToolCallHandleResolver(() => {
          if (!activeTurnHandle) {
            throw new Error("Tool execution started before the canonical request header");
          }
          return activeTurnHandle;
        }, resumedSuspension?.calls ?? []),
        preferences.agentAutoApprove,
      );
      useChatStore.getState().patchAgentMeta({
        status: "thinking",
        step: null,
        error: null,
      });
      const root = runtime.getWorkspaceRoot?.() ?? null;
      const projectMemory = await readProjectMemory(root);
      const envBlock = formatEnvBlock({
        workspaceRoot: root,
        cwd: useChatStore.getState().live.getCwd(sessionRigId(sessionId)),
        activeFile: useChatStore.getState().live.getActiveFile(),
        activeKind: useChatStore.getState().live.getActiveKind(),
        terminalPrivate: useChatStore
          .getState()
          .live.isActiveTerminalPrivate(sessionRigId(sessionId)),
      });
      const stableInstructions = buildStableSystemPrompt({
        modelId,
        agent,
        customInstructions: preferences.customInstructions,
        projectMemory,
        skills: enabledSkillsFor(root),
        terse: preferences.terseReplies,
        summaryBlocks: session?.compaction?.blocks,
        transcriptIds: session?.compaction?.transcriptIds,
      });
      const contextualMessages = envBlock
        ? injectEnvIntoLastUser(options.messages, envBlock)
        : options.messages;
      const compatibleMessages = model
        ? sanitizeHistoryForModel(contextualMessages, modelId, model)
        : contextualMessages;
      const convertedMessages = await convertToModelMessages(compatibleMessages, {
        tools: tools as never,
        ignoreIncompleteToolCalls: true,
      });
      const prompt = buildProviderPrompt({
        provider: model?.provider ?? "openai-compatible",
        stable: stableInstructions,
        planMode: usePlanStore.getState().active,
        messages: convertedMessages,
      });
      const toolDescriptions = describeSessionTools(
        definitions,
        registry.contributors,
      );
      const approvalPolicy = preferences.agentAutoApprove
        ? { mode: "allow-safe" }
        : { mode: "ask" };
      const providerModelId = providerModelIdForSelection(
        modelId,
        preferences.customEndpoints,
      );
      const turnHandle = await beginOwnedChatRequest({
        sessionId,
        userMessage: last ?? { role: "user", parts: [] },
        selectedModelId: modelId,
        providerRoute: model?.provider ?? "openai-compatible",
        providerModelId,
        ...(model?.contextWindow === undefined ? {} : { contextWindow: model.contextWindow }),
        reasoningEffort,
        instructions: typeof prompt.instructions === "string"
          ? prompt.instructions
          : JSON.stringify(prompt.instructions),
        messages: prompt.messages,
        tools: toolDescriptions,
        activeTools: initialActiveTools,
        approvalPolicy,
      });
      activeTurnHandle = turnHandle;
      const streamRecorder = createSessionStreamRecorder(
        () => activeTurnHandle!,
        {
          sessionId,
          definitions,
          execution: selectedToolExecution(),
          contributors: registry.contributors,
          approvalPolicy,
          ...(resumedSuspension ? { initialCalls: resumedSuspension.calls } : {}),
        },
      );
      const owningChat = chats.get(sessionId);
      const turnClosure = sessionTurnClosures.open(sessionId, async () => {
        const lastMessage = owningChat?.messages.at(-1);
        const responseMessage = lastMessage?.role === "assistant"
          ? lastMessage
          : {
              id: crypto.randomUUID(),
              role: "assistant" as const,
              parts: [],
            };
        const settled = await settleChatProviderEnd({
          sessionId,
          handle: activeTurnHandle!,
          responseMessage,
          finishReason: "abort",
          ...(finalUsage ? { usage: finalUsage } : {}),
          waiting: streamRecorder.waiting(),
        });
        if (settled === "suspended") await cancelOwnedSuspension(sessionId);
      });
      const stepPersistence = createSessionStepPersistenceGate();
      const closeFailedTurn = async (error: unknown): Promise<void> => {
        await turnClosure.close(async () => {
          if (isInferenceRequestFailure(error) && error.cancelled) {
            await streamRecorder.terminateWaiting({
              name: "ToolExecutionCancelled",
              code: "USER_CANCELLED",
              message: "The provider request was cancelled while a tool awaited input",
            }, "cancelled");
            await abortChatTurn({ sessionId, handle: activeTurnHandle! });
            return;
          }
          const detail = error && typeof error === "object"
            ? error as { name?: unknown; code?: unknown; message?: unknown }
            : {};
          await streamRecorder.terminateWaiting({
            name: typeof detail.name === "string" ? detail.name : "ProviderError",
            code: typeof detail.code === "string" ? detail.code : "PROVIDER_FAILED",
            message: typeof detail.message === "string" ? detail.message : String(error),
          }, "unavailable");
          await failChatTurn({
            sessionId,
            handle: activeTurnHandle!,
            ...(isInferenceRequestFailure(error) ? { attempt: error.attempt } : {}),
            error,
          });
        });
      };
      let stepsSeen = 0;
      let finalUsage: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number } | undefined;
      let result: Awaited<ReturnType<AiInferenceCapability["stream"]>>;
      try {
        const initialRequestId = activeTurnHandle.requestId;
        const stream = createRetryingInferenceStream<unknown>({
          history: {
            async append(_id, events, appendOptions) {
              await appendSessionEvents(
                sessionId,
                events,
                appendOptions?.durability ?? "written",
              );
              return undefined as never;
            },
          },
          sessionId: SessionId(sessionId),
          requestId: initialRequestId,
          signal: options.abortSignal,
          async invoke(_attempt, signal) {
            const inferenceResult = await selectedInference().stream({
              modelId,
              instructions: prompt.instructions,
              messages: prompt.messages,
              tools,
              activeTools: initialActiveTools,
              reasoningEffort,
              maxSteps: 100,
              abortSignal: signal,
              async prepareStep({ steps, stepNumber, instructions, messages }) {
                const skill = activeSkillFromSteps(steps);
                const selectedActiveTools = disclosure.activeToolNames(
                  skill?.allowedGroups,
                );
                if (stepNumber > 0) {
                  await stepPersistence.beforeStep(stepNumber);
                  activeTurnHandle = await beginNextChatStep({
                    sessionId,
                    previous: activeTurnHandle!,
                    selectedModelId: modelId,
                    providerRoute: model?.provider ?? "openai-compatible",
                    providerModelId,
                    ...(model?.contextWindow === undefined
                      ? {}
                      : { contextWindow: model.contextWindow }),
                    reasoningEffort,
                    instructions: typeof instructions === "string"
                      ? instructions
                      : JSON.stringify(instructions ?? ""),
                    messages,
                    tools: toolDescriptions,
                    activeTools: selectedActiveTools,
                    approvalPolicy,
                  });
                }
                return { activeTools: selectedActiveTools };
              },
              onStepEnd(step) {
                stepsSeen += 1;
                const toolName = step.toolCalls?.at(-1)?.toolName ?? null;
                const state = useChatStore.getState();
                const meta = state.agentMeta;
                const usage = step.usage;
                const performance = step.performance;
                const inputTokens = usage?.inputTokens ?? 0;
                const outputTokens = usage?.outputTokens ?? 0;
                const cachedInputTokens =
                  usage?.inputTokenDetails?.cacheReadTokens ?? 0;
                finalUsage = usage
                  ? {
                      inputTokens,
                      outputTokens,
                      cacheReadTokens: cachedInputTokens,
                    }
                  : finalUsage;
                state.patchAgentMeta({
                  status: "streaming",
                  step: toolName,
                  ...(usage
                    ? {
                        tokens: {
                          inputTokens: meta.tokens.inputTokens + inputTokens,
                          outputTokens: meta.tokens.outputTokens + outputTokens,
                          cachedInputTokens:
                            meta.tokens.cachedInputTokens + cachedInputTokens,
                        },
                        lastInputTokens: inputTokens,
                        lastCachedTokens: cachedInputTokens,
                      }
                    : {}),
                  lastTokensPerSecond:
                    performance?.outputTokensPerSecond ??
                    performance?.effectiveOutputTokensPerSecond ??
                    meta.lastTokensPerSecond,
                  timeToFirstOutputMs:
                    stepsSeen === 1
                      ? (performance?.timeToFirstOutputMs ??
                        meta.timeToFirstOutputMs)
                      : meta.timeToFirstOutputMs,
                });
              },
              onEnd() {
                useChatStore.getState().patchAgentMeta({
                  status: "idle",
                  step: null,
                });
              },
            });
            const readable = inferenceResult.stream as ReadableStream<unknown> | null;
            if (!readable || typeof readable.getReader !== "function") {
              throw new TypeError("Inference provider returned a non-readable stream");
            }
            return readable;
          },
        });
        result = { stream };
      } catch (error) {
        await closeFailedTurn(error);
        throw error;
      }
      return toUIMessageStream({
        stream: recordedStream(
          sessionId,
          result.stream,
          streamRecorder.record,
          stepPersistence.partPersisted,
        ) as never,
        tools: tools as never,
        originalMessages: options.messages,
        generateMessageId: () => crypto.randomUUID(),
        messageMetadata: ({ part }) =>
          part.type === "finish" ? { modelId } : undefined,
        async onEnd({ responseMessage, finishReason, isAborted }) {
          await turnClosure.close(async () => {
            const settled = await settleChatProviderEnd({
              sessionId,
              handle: activeTurnHandle!,
              responseMessage,
              finishReason: isAborted ? "abort" : (finishReason ?? "unknown"),
              ...(finalUsage ? { usage: finalUsage } : {}),
              waiting: streamRecorder.waiting(),
            });
            if (isAborted && settled === "suspended") {
              await cancelOwnedSuspension(sessionId);
            }
          });
        },
        onError(error) {
          const detail = (error ?? {}) as ErrorDetail;
          noteStreamError(sessionId, error, detail);
          const message = buildErrorMessage(error, detail);
          useChatStore.getState().patchAgentMeta({ status: "error", error: message });
          void closeFailedTurn(error).catch((closeError) => {
            console.error("Failed to persist the provider-error turn closure", closeError);
          });
          return message;
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}

export function getOrCreateOwnedChat(sessionId: string): Chat<UIMessage> {
  const existing = chats.get(sessionId);
  if (existing) {
    touchChat(sessionId, existing);
    return existing;
  }
  const messages = seedMessages.get(sessionId);
  seedMessages.delete(sessionId);
  const chat = new Chat<UIMessage>({
    id: sessionId,
    transport: createProviderTransport(sessionId),
    messages,
    sendAutomaticallyWhen: shouldResumeOwnedChat,
    onError(error) {
      useChatStore.getState().patchAgentMeta({
        status: "error",
        error: error.message,
      });
    },
  });
  touchChat(sessionId, chat);
  return chat;
}

export async function sendOwnedMessage(
  sessionId: string,
  text: string,
): Promise<void> {
  await getOrCreateOwnedChat(sessionId).sendMessage({
    role: "user",
    parts: [{ type: "text", text }],
  });
}

export async function sendOwnedUiMessage(
  sessionId: string,
  message: UIMessage,
): Promise<void> {
  const { id: _id, ...input } = message;
  await getOrCreateOwnedChat(sessionId).sendMessage(input);
}

/** Stops provider work and makes the interrupted turn durable before returning. */
export async function stopOwnedChat(
  sessionId: string,
  chat = chats.get(sessionId),
): Promise<void> {
  // Abort the live provider before any history IPC. Session inspection can be
  // arbitrarily expensive for a long conversation and must never delay Stop.
  const stopping = chat?.stop();
  const suspension = await readOwnedSuspension(sessionId);
  await finishOwnedChatStop(sessionId, stopping);
  if (chat && suspension) {
    const cancelled = new Set(suspension.callIds.map(String));
    chat.messages = chat.messages.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        if (!isToolUIPart(part) || !cancelled.has(String(part.toolCallId))) return part;
        return {
          ...part,
          input: "input" in part ? part.input : null,
          state: "output-error" as const,
          output: undefined,
          errorText: "Stopped by user",
          approval: undefined,
        } as UIMessage["parts"][number];
      }),
    }));
  }
}

export async function finishOwnedChatStop(
  sessionId: string,
  stopping?: Promise<void>,
): Promise<void> {
  await stopping;
  await sessionTurnClosures.stop(sessionId);
  await cancelOwnedSuspension(sessionId);
  useChatStore.getState().patchAgentMeta({ status: "idle", step: null });
}

async function cancelOwnedSuspension(sessionId: string): Promise<boolean> {
  const suspension = await readOwnedSuspension(sessionId);
  if (!suspension) return false;
  const execution = selectedToolExecution();
  for (const approvalId of suspension.pendingApprovalIds) {
    const approval = suspension.approvals.find((candidate) =>
      String(candidate.approvalId) === String(approvalId)
    );
    const call = approval && suspension.calls.find((candidate) =>
      String(candidate.callId) === String(approval.callId)
    );
    if (!approval || !call) {
      throw new Error(`Pending approval ${approvalId} has no owning tool call`);
    }
    await execution.recordApprovalDecision({
      call,
      approvalId,
      outcome: "cancelled",
      responder: "user",
    });
  }
  const registry = buildSessionToolRegistry(toolRuntime(sessionId));
  for (const callId of suspension.unresolvedCallIds) {
    const call = suspension.calls.find((candidate) =>
      String(candidate.callId) === String(callId)
    );
    if (!call) throw new Error(`Pending tool call ${callId} has no canonical identity`);
    const definition = registry.definitions[call.name] ?? {
      description: `Unavailable tool ${call.name}`,
      inputSchema: { type: "object" },
    };
    await execution.complete({
      ...call,
      definition,
      error: {
        name: "ToolExecutionCancelled",
        code: "USER_CANCELLED",
        message: "The user stopped while this tool was waiting for input",
      },
    });
  }
  await cancelSuspendedChatTurn({
    sessionId,
    suspended: suspension.handle,
  });
  return true;
}

import type {
  AiCustomModelEndpoint,
  AiModelDefinition,
  AiModelProviderCapability,
  AiProviderId,
  AiReasoningEffort,
} from "@termco/ai-models-base";
import type { PreferencesCapability } from "@termco/storage-base";
import type { UIMessage } from "ai";
import {
  SESSION_FORMAT_VERSION,
  ApprovalId,
  CompactionId,
  RequestId,
  SessionId,
  SessionSeq,
  StepId,
  ToolCallId,
  TurnId,
  foldSurface,
  projectChat,
  projectCompactionPolicy,
  type AppendSessionEvent,
  type CompactionPolicyState,
  type ForkSessionInput,
  type JsonObject,
  type JsonValue,
  type PluginProvenance,
  type SessionHistoryCapability,
} from "@termco/session-base";
import type { SessionCompaction } from "./sessions";

const SESSION_STATE_KEY = "ai.sessions.state";
const RECENT_MODELS_KEY = "recentModelIds";
const RECENT_MODELS_MAX = 5;

let preferences: PreferencesCapability | null = null;
let sessionHistory: SessionHistoryCapability | null = null;
let sessionMessageSender: ((sessionId: string, message: UIMessage) => Promise<void>) | null = null;
let defaultModelId = "gpt-5.4-mini";
let modelProviders: readonly AiModelProviderCapability[] = [];
let models: readonly AiModelDefinition[] = [];
const sessionQueues = new Map<string, Promise<void>>();
let sessionMutationQueue = Promise.resolve();

export function configureSessionRuntime(input: {
  preferences: PreferencesCapability;
  history: SessionHistoryCapability;
  models: readonly AiModelProviderCapability[];
  sendMessage?: (sessionId: string, message: UIMessage) => Promise<void>;
}): () => void {
  const previous = {
    preferences,
    sessionHistory,
    sessionMessageSender,
    defaultModelId,
    modelProviders,
    models,
  };
  preferences = input.preferences;
  sessionHistory = input.history;
  sessionMessageSender = input.sendMessage ?? null;
  defaultModelId =
    input.models.find((provider) => provider.defaultModelId)?.defaultModelId ??
    defaultModelId;
  modelProviders = input.models;
  models = modelProviders.flatMap((provider) => provider.models);
  return () => {
    if (preferences !== input.preferences || sessionHistory !== input.history) return;
    preferences = previous.preferences;
    sessionHistory = previous.sessionHistory;
    sessionMessageSender = previous.sessionMessageSender;
    defaultModelId = previous.defaultModelId;
    modelProviders = previous.modelProviders;
    models = previous.models;
  };
}

export function sessionRuntimeActive(): boolean {
  return preferences !== null || sessionHistory !== null || modelProviders.length > 0;
}

export function selectedDefaultModelId(): string {
  return defaultModelId;
}

export function availableModels(): readonly AiModelDefinition[] {
  return models;
}

export function availableModelProviders(): readonly AiModelProviderCapability[] {
  return modelProviders;
}

export function modelProvider(
  providerId: AiProviderId,
): AiModelProviderCapability | undefined {
  return modelProviders.find((provider) => provider.id === providerId);
}

export function providerRequiresKey(providerId: AiProviderId): boolean {
  return modelProvider(providerId)?.keyRequirement === "required";
}

function customEndpointConvention() {
  return modelProvider("openai-compatible")?.customEndpoint;
}

function requiredCustomEndpointConvention() {
  const convention = customEndpointConvention();
  if (!convention) {
    throw new Error(
      "The selected AI model providers do not support custom endpoints",
    );
  }
  return convention;
}

export function isCustomEndpointModel(modelId: string): boolean {
  return customEndpointConvention()?.endpointIdFrom(modelId) != null;
}

export function customEndpointId(modelId: string): string | null {
  return customEndpointConvention()?.endpointIdFrom(modelId) ?? null;
}

export function modelIdForCustomEndpoint(endpointId: string): string {
  return requiredCustomEndpointConvention().modelIdFor(endpointId);
}

export function customEndpointModel(
  endpoint: AiCustomModelEndpoint,
): AiModelDefinition {
  return requiredCustomEndpointConvention().modelFor(endpoint);
}

export function providerModelIdForSelection(
  selectedModelId: string,
  endpoints: readonly AiCustomModelEndpoint[] = [],
): string {
  const endpointId = customEndpointId(selectedModelId);
  if (!endpointId) return selectedModelId;
  return endpoints.find((endpoint) => endpoint.id === endpointId)?.modelId ??
    selectedModelId;
}

export function resolveAvailableModel(
  modelId: string,
  endpoints: readonly AiCustomModelEndpoint[] = [],
): AiModelDefinition | undefined {
  const registered = models.find((model) => model.id === modelId);
  if (registered) return registered;
  const endpointId = customEndpointId(modelId);
  const endpoint = endpointId
    ? endpoints.find((candidate) => candidate.id === endpointId)
    : undefined;
  return endpoint ? customEndpointModel(endpoint) : undefined;
}

export function effectiveReasoningEffort(
  model: AiModelDefinition,
  stored: AiReasoningEffort | undefined,
): AiReasoningEffort {
  const support = model.reasoning;
  if (!support) return "off";
  if (stored && (stored === "off" || support.levels.includes(stored))) {
    return stored;
  }
  return support.default;
}

export function modelContextLimit(
  modelId: string,
  endpoints: readonly AiCustomModelEndpoint[] = [],
): number {
  const model = resolveAvailableModel(modelId, endpoints);
  if (model?.contextWindow) return model.contextWindow;
  return modelProvider(model?.provider ?? "openai-compatible")
    ?.defaultContextLimit ?? 128_000;
}

export function estimateModelCost(
  modelId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
  },
): number | null {
  const pricing = resolveAvailableModel(modelId)?.pricing;
  if (!pricing) return null;
  const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (fresh * pricing.input +
      usage.cachedInputTokens * (pricing.cacheRead ?? pricing.input) +
      usage.outputTokens * pricing.output) /
    1_000_000
  );
}

export async function loadSessionState(): Promise<Record<string, unknown>> {
  return (
    (await preferences?.get<Record<string, unknown>>(SESSION_STATE_KEY)) ?? {}
  );
}

export async function saveSessionState(
  key: string,
  value: unknown,
): Promise<void> {
  if (!preferences) return;
  sessionMutationQueue = sessionMutationQueue.then(async () => {
    const state = await loadSessionState();
    await preferences?.set(SESSION_STATE_KEY, { ...state, [key]: value });
  });
  await sessionMutationQueue;
}

export async function deleteSessionDataValue(key: string): Promise<void> {
  if (!preferences) return;
  sessionMutationQueue = sessionMutationQueue.then(async () => {
    const state = await loadSessionState();
    if (!(key in state)) return;
    const next = { ...state };
    delete next[key];
    await preferences?.set(SESSION_STATE_KEY, next);
  });
  await sessionMutationQueue;
}

export async function pushRecentModel(id: string): Promise<void> {
  if (!preferences) return;
  const current =
    (await preferences.get<string[]>(RECENT_MODELS_KEY)) ?? [];
  const next = [id, ...current.filter((entry) => entry !== id)].slice(
    0,
    RECENT_MODELS_MAX,
  );
  await preferences.set(RECENT_MODELS_KEY, next);
}

function requiredHistory(): SessionHistoryCapability {
  if (!sessionHistory) throw new Error("Session history provider is not active");
  return sessionHistory;
}

function jsonValue(value: unknown): JsonValue {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) return null;
  return JSON.parse(encoded) as JsonValue;
}

function jsonObject(value: unknown): JsonObject {
  const parsed = jsonValue(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { value: parsed };
  }
  return parsed as JsonObject;
}

function enqueueSession<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  const previous = sessionQueues.get(sessionId) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  const tail = result.then(() => undefined, () => undefined);
  sessionQueues.set(sessionId, tail);
  void tail.finally(() => {
    if (sessionQueues.get(sessionId) === tail) sessionQueues.delete(sessionId);
  });
  return result;
}

function missingSession(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && (error as { readonly code?: unknown }).code === "SESSION_NOT_FOUND";
}

async function ensureSessionNow(
  sessionId: string,
  input: { readonly title: string; readonly rigId?: string; readonly createdAt?: number },
): Promise<void> {
  const history = requiredHistory();
  const id = SessionId(sessionId);
  try {
    await history.inspect(id);
    return;
  } catch (error) {
    if (!missingSession(error)) throw error;
  }
  const createdAt = input.createdAt ?? Date.now();
  await history.create({
    header: {
      formatVersion: SESSION_FORMAT_VERSION,
      id,
      createdAt,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
      ...(input.rigId ? { rigId: input.rigId } : {}),
    },
    seed: [
      {
        type: "session/title",
        time: createdAt,
        data: { title: input.title, source: "system" },
      },
    ],
    durability: "written",
  });
}

export function ensureOwnedSession(
  sessionId: string,
  input: { readonly title: string; readonly rigId?: string; readonly createdAt?: number },
): Promise<void> {
  return enqueueSession(sessionId, () => ensureSessionNow(sessionId, input));
}

/**
 * Makes the canonical current-format tail safe before opening another turn.
 * Healthy sessions are unchanged; a tail left open by a crash, renderer loss,
 * or an older interrupted process is closed by the session owner first.
 */
export function prepareOwnedSessionForContinuation(
  sessionId: string,
): Promise<void> {
  return enqueueSession(sessionId, async () => {
    await requiredHistory().loadForContinuation(SessionId(sessionId));
  });
}

export async function listOwnedSessions(): Promise<readonly {
  readonly id: string;
  readonly title: string;
  readonly rigId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}[]> {
  const history = requiredHistory();
  const sessions: Array<{
    id: string;
    title: string;
    rigId: string;
    createdAt: number;
    updatedAt: number;
  }> = [];
  let cursor: string | undefined;
  do {
    const page = await history.list({
      ...(cursor === undefined ? {} : { cursor }),
      limit: 100,
    });
    for (const listing of page.sessions) {
      if (
        listing.backend !== "chat" ||
        listing.health === "corrupt-prefix" ||
        listing.health === "unsupported-format"
      ) continue;
      sessions.push({
        id: String(listing.sessionId),
        title: listing.title ?? "Untitled session",
        rigId: listing.rigId ?? "default",
        createdAt: listing.createdAt,
        updatedAt: listing.updatedAt,
      });
    }
    if (page.exhausted) break;
    if (!page.cursor || page.cursor === cursor) {
      throw new Error("Canonical session listing did not advance");
    }
    cursor = page.cursor;
  } while (true);
  return sessions.sort(
    (left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id),
  );
}

export async function setOwnedSessionTitle(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly rigId?: string;
  readonly createdAt?: number;
  readonly source: "system" | "user" | "model";
}): Promise<void> {
  await ensureOwnedSession(input.sessionId, {
    title: input.title,
    ...(input.rigId === undefined ? {} : { rigId: input.rigId }),
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
  });
  await appendSessionEvents(input.sessionId, [{
    type: "session/title",
    time: Date.now(),
    data: { title: input.title, source: input.source },
  }]);
}

export function setOwnedSessionRig(
  sessionId: string,
  rigId: string,
): Promise<void> {
  return appendSessionEvents(sessionId, [{
    type: "session/rig",
    time: Date.now(),
    data: { rigId, source: "workspace" },
  }]);
}

export function saveOwnedWorkspaceSnapshot(
  sessionId: string,
  snapshot: JsonObject,
): Promise<void> {
  return appendSessionEvents(sessionId, [{
    type: "workspace/checkpoint",
    time: Date.now(),
    data: {
      checkpointId: "workspace-snapshot",
      backend: "workspace-tabs",
      reference: snapshot,
      summary: "Workspace tabs captured for this session",
    },
  }]);
}

export async function loadOwnedWorkspaceSnapshot(
  sessionId: string,
): Promise<JsonObject | null> {
  const session = await readAllSessionEvents(sessionId);
  const checkpoint = [...session.events].reverse().find((event) => {
    if (event.type !== "workspace/checkpoint") return false;
    const data = event.data as Record<string, unknown>;
    return data.checkpointId === "workspace-snapshot" &&
      data.backend === "workspace-tabs";
  });
  if (!checkpoint) return null;
  const reference = (checkpoint.data as Record<string, unknown>).reference;
  return reference && typeof reference === "object" && !Array.isArray(reference)
    ? structuredClone(reference as JsonObject)
    : null;
}

export async function removeOwnedSession(sessionId: string): Promise<void> {
  await enqueueSession(sessionId, async () => {
    await requiredHistory().remove(SessionId(sessionId));
  });
}

export function appendSessionEvents(
  sessionId: string,
  events: readonly AppendSessionEvent[],
  durability: "memory" | "written" | "flushed" = "written",
): Promise<void> {
  return enqueueSession(sessionId, async () => {
    await requiredHistory().append(SessionId(sessionId), events, { durability });
  });
}

export function appendSessionDiagnostic(
  sessionId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  return appendSessionEvents(sessionId, [{
    type: "adapter/event",
    time: Date.now(),
    data: { adapter: "ai-chat-native", kind, payload: jsonValue(payload) },
  }]);
}

async function readAllSessionEvents(sessionId: string) {
  const history = requiredHistory();
  const id = SessionId(sessionId);
  const first = await history.readWindow(id, { kind: "head", limit: 512 });
  const events = [...first.events];
  let current = first;
  while (current.availability.later) {
    const tail = events.at(-1);
    if (!tail) break;
    current = await history.readWindow(id, { kind: "after", seq: tail.seq, limit: 512 });
    if (current.revision !== first.revision) {
      throw new Error(`Session ${sessionId} changed while it was being restored`);
    }
    events.push(...current.events);
  }
  return { header: first.header, events };
}

export async function readLatestCompletedToolCall(
  sessionId: string,
  toolName: string,
): Promise<{
  readonly callId: string;
  readonly input: JsonValue;
  readonly output: JsonValue;
} | null> {
  const { events } = await readAllSessionEvents(sessionId);
  const dataOf = (event: typeof events[number]): Record<string, unknown> =>
    event.data as unknown as Record<string, unknown>;
  const results = new Map<string, JsonValue>();
  for (const event of events) {
    if (event.type !== "tool/result") continue;
    const data = dataOf(event);
    if (data.error !== undefined) continue;
    results.set(String(data.callId), (data.canonicalOutput ?? null) as JsonValue);
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== "tool/call") continue;
    const data = dataOf(event);
    if (data.name !== toolName) continue;
    const callId = String(data.callId);
    if (!results.has(callId)) continue;
    return {
      callId,
      input: (data.parsedInput ?? null) as JsonValue,
      output: results.get(callId) ?? null,
    };
  }
  return null;
}

export async function readOwnedSuspension(sessionId: string): Promise<{
  readonly handle: ChatTurnHandle;
  readonly callIds: readonly ReturnType<typeof ToolCallId>[];
  readonly approvalIds: readonly ReturnType<typeof ApprovalId>[];
  readonly pendingCallIds: readonly ReturnType<typeof ToolCallId>[];
  readonly pendingApprovalIds: readonly ReturnType<typeof ApprovalId>[];
  readonly unresolvedCallIds: readonly ReturnType<typeof ToolCallId>[];
  readonly readyToResume: boolean;
  readonly approvals: ReadonlyArray<{
    readonly approvalId: ReturnType<typeof ApprovalId>;
    readonly callId: ReturnType<typeof ToolCallId>;
  }>;
  readonly calls: ReadonlyArray<{
    readonly sessionId: ReturnType<typeof SessionId>;
    readonly turn: ReturnType<typeof TurnId>;
    readonly step: ReturnType<typeof StepId>;
    readonly requestId: ReturnType<typeof RequestId>;
    readonly callId: ReturnType<typeof ToolCallId>;
    readonly name: string;
    readonly input: JsonValue;
    readonly contributor: PluginProvenance;
  }>;
} | null> {
  const { events } = await readAllSessionEvents(sessionId);
  let suspended: typeof events[number] | undefined;
  for (const event of events) {
    if (event.type === "turn/suspend") suspended = event;
    if (event.type === "turn/resume" || event.type === "turn/end") suspended = undefined;
  }
  if (suspended?.type !== "turn/suspend") return null;
  const data = suspended.data as unknown as {
    readonly callIds: readonly unknown[];
    readonly approvalIds: readonly unknown[];
  };
  const eventData = (event: typeof events[number]): Record<string, unknown> =>
    event.data as unknown as Record<string, unknown>;
  const callIds = data.callIds.map((callId) => ToolCallId(String(callId)));
  const approvalIds = data.approvalIds.map((approvalId) => ApprovalId(String(approvalId)));
  const resolvedCallIds = new Set(events
    .filter((event) => event.type === "tool/result")
    .map((event) => String(eventData(event).callId)));
  const decidedApprovalIds = new Set(events
    .filter((event) => event.type === "approval/decision")
    .map((event) => String(eventData(event).approvalId)));
  const approvalByCallId = new Map<string, string>(events
    .filter((event) => event.type === "approval/request")
    .map((event) => [
      String(eventData(event).callId),
      String(eventData(event).approvalId),
    ]));
  const approvals = approvalIds.map((approvalId) => {
    const event = events.find((candidate) =>
      candidate.type === "approval/request" &&
      String(eventData(candidate).approvalId) === String(approvalId)
    );
    if (!event) {
      throw new Error(`Suspended session ${sessionId} has no approval ${approvalId}`);
    }
    return {
      approvalId,
      callId: ToolCallId(String(eventData(event).callId)),
    };
  });
  const pendingApprovalIds = approvalIds.filter((approvalId) =>
    !decidedApprovalIds.has(String(approvalId))
  );
  const unresolvedCallIds = callIds.filter((callId) =>
    !resolvedCallIds.has(String(callId))
  );
  const pendingCallIds = callIds.filter((callId) => {
    if (resolvedCallIds.has(String(callId))) return false;
    const approvalId = approvalByCallId.get(String(callId));
    return approvalId === undefined || !decidedApprovalIds.has(approvalId);
  });
  const calls = callIds.map((callId) => {
    const event = events.find((candidate) =>
      candidate.type === "tool/call" &&
      String(eventData(candidate).callId) === String(callId)
    );
    if (!event) {
      throw new Error(`Suspended session ${sessionId} has no call ${callId}`);
    }
    const callData = eventData(event);
    return {
      sessionId: SessionId(sessionId),
      turn: TurnId(Number(callData.turn)),
      step: StepId(Number(callData.step)),
      requestId: RequestId(String(callData.requestId)),
      callId,
      name: String(callData.name),
      input: (callData.parsedInput ?? null) as JsonValue,
      contributor: callData.contributor as PluginProvenance,
    };
  });
  const owner = calls[0];
  if (!owner) throw new Error(`Suspended session ${sessionId} has no owning tool call`);
  return {
    handle: {
      turn: owner.turn,
      step: owner.step,
      requestId: owner.requestId,
    },
    callIds,
    approvalIds,
    pendingCallIds,
    pendingApprovalIds,
    unresolvedCallIds,
    readyToResume: pendingCallIds.length === 0 && pendingApprovalIds.length === 0,
    approvals,
    calls,
  };
}

export async function readSessionMessages(sessionId: string): Promise<readonly UIMessage[]> {
  const session = await readAllSessionEvents(sessionId);
  return sessionUiMessages(session.header, session.events);
}

function sessionUiMessages(
  header: Awaited<ReturnType<typeof readAllSessionEvents>>["header"],
  events: Awaited<ReturnType<typeof readAllSessionEvents>>["events"],
): readonly UIMessage[] {
  return projectChat(header, foldSurface(events)).messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => message.message as unknown as UIMessage);
}

function contentText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const text = (content as Record<string, unknown>).text;
  return typeof text === "string" ? text : null;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function canonicalCompaction(
  header: Awaited<ReturnType<typeof readAllSessionEvents>>["header"],
  events: Awaited<ReturnType<typeof readAllSessionEvents>>["events"],
): SessionCompaction | undefined {
  const surface = foldSurface(events);
  const currentCompactions = surface.currentEvents
    .filter((event) => event.type === "compaction/message")
    .map((event) => {
      const data = event.data as Record<string, unknown>;
      const content = data.content;
      const record = content && typeof content === "object" && !Array.isArray(content)
        ? content as Record<string, unknown>
        : {};
      const blocks = stringArray(record.blocks);
      const text = contentText(content);
      return {
        event,
        id: String(data.compactionId),
        blocks: blocks.length > 0 ? blocks : text === null ? [] : [text],
      };
    })
    .filter((entry) => entry.blocks.length > 0);
  const latest = currentCompactions.at(-1);
  if (!latest) return undefined;

  const start = events.find(
    (event) =>
      event.type === "compaction/start" &&
      String((event.data as Record<string, unknown>).compactionId) === latest.id,
  );
  const summary = events.find(
    (event) =>
      event.type === "compaction/summary" &&
      String((event.data as Record<string, unknown>).compactionId) === latest.id,
  );
  const end = events.find(
    (event) =>
      event.type === "compaction/end" &&
      String((event.data as Record<string, unknown>).compactionId) === latest.id &&
      (event.data as Record<string, unknown>).outcome === "succeeded",
  );
  if (!start || !summary || !end) return undefined;

  const startData = start.data as Record<string, unknown>;
  const request = (summary.data as Record<string, unknown>).request;
  const descriptor = request && typeof request === "object" && !Array.isArray(request)
    ? request as Record<string, unknown>
    : {};
  const successfulRounds = events.filter(
    (event) =>
      event.type === "compaction/end" &&
      (event.data as Record<string, unknown>).outcome === "succeeded",
  ).length;
  const sourceSessionIds = stringArray(descriptor.sourceSessionIds);
  const parentId = header.parent?.sessionId === undefined
    ? undefined
    : String(header.parent.sessionId);
  const transcriptIds = sourceSessionIds.length > 0
    ? sourceSessionIds
    : parentId === undefined
      ? []
      : [parentId];

  return {
    blocks: currentCompactions.flatMap((entry) => entry.blocks),
    transcriptIds,
    sourceSessionId: transcriptIds[0] ?? parentId ?? String(header.id),
    trigger: startData.trigger === "manual" ? "manual" : "auto",
    round: successfulRounds,
    droppedCount: numberField(descriptor.droppedCount) ?? 0,
    ...(numberField(descriptor.tailCount) === undefined
      ? {}
      : { tailCount: numberField(descriptor.tailCount) }),
    ...(numberField(descriptor.summarizedGroups) === undefined
      ? {}
      : { summarizedGroups: numberField(descriptor.summarizedGroups) }),
    ...(numberField(descriptor.preservedGroups) === undefined
      ? {}
      : { preservedGroups: numberField(descriptor.preservedGroups) }),
    ...(numberField(descriptor.preTokens) === undefined
      ? {}
      : { preTokens: numberField(descriptor.preTokens) }),
    ...(numberField(descriptor.durationMs) === undefined
      ? {}
      : { durationMs: numberField(descriptor.durationMs) }),
    at: end.time,
  };
}

export interface OwnedCompactionPlan {
  readonly boundarySeq: ReturnType<typeof SessionSeq>;
  readonly candidate: {
    readonly start: ReturnType<typeof SessionSeq>;
    readonly end: ReturnType<typeof SessionSeq>;
    readonly sourceEventSeqs: readonly ReturnType<typeof SessionSeq>[];
  };
  readonly previous?: SessionCompaction;
}

async function planOwnedCompactionNow(
  sessionId: string,
  lastHeadMessageId: string,
): Promise<OwnedCompactionPlan> {
  const session = await readAllSessionEvents(sessionId);
  const boundarySeq = session.events.at(-1)?.seq;
  if (boundarySeq === undefined) {
    throw new Error(`Session ${sessionId} has no canonical fork boundary`);
  }
  const surface = foldSurface(session.events);
  const endIndex = surface.currentEvents.findIndex((event) => {
    if (event.type !== "user/message" && event.type !== "assistant/message") return false;
    const message = (event.data as Record<string, unknown>).message;
    return Boolean(
      message &&
      typeof message === "object" &&
      !Array.isArray(message) &&
      (message as Record<string, unknown>).id === lastHeadMessageId,
    );
  });
  if (endIndex < 0) {
    throw new Error(
      `Session ${sessionId} has no current surface message ${lastHeadMessageId}`,
    );
  }
  const candidateEvents = surface.currentEvents.slice(0, endIndex + 1);
  const start = candidateEvents[0]?.seq;
  const end = candidateEvents.at(-1)?.seq;
  if (start === undefined || end === undefined) {
    throw new Error(`Session ${sessionId} has no compactable canonical surface range`);
  }
  return {
    boundarySeq,
    candidate: {
      start,
      end,
      sourceEventSeqs: candidateEvents.map((event) => event.seq),
    },
    ...(canonicalCompaction(session.header, session.events) === undefined
      ? {}
      : { previous: canonicalCompaction(session.header, session.events) }),
  };
}

export function planOwnedCompaction(
  sessionId: string,
  lastHeadMessageId: string,
): Promise<OwnedCompactionPlan> {
  return enqueueSession(
    sessionId,
    () => planOwnedCompactionNow(sessionId, lastHeadMessageId),
  );
}

export async function beginOwnedCompaction(input: {
  readonly sourceSessionId: string;
  readonly plan: OwnedCompactionPlan;
  readonly title: string;
  readonly trigger: "automatic" | "manual" | "provider-overflow";
  readonly measuredTokens: number;
}): Promise<{ readonly sessionId: string; readonly compactionId: string }> {
  const fork = await forkOwnedSession({
    sessionId: SessionId(input.sourceSessionId),
    boundary: { kind: "event", seq: input.plan.boundarySeq },
    title: input.title,
    origin: "compaction",
  });
  const compactionId = CompactionId(crypto.randomUUID());
  await appendSessionEvents(String(fork.childSessionId), [{
    type: "compaction/start",
    time: Date.now(),
    data: {
      compactionId,
      trigger: input.trigger,
      measuredTokens: input.measuredTokens,
      candidate: {
        start: input.plan.candidate.start,
        end: input.plan.candidate.end,
      },
      policyRevision: "1",
    },
  }], "flushed");
  return { sessionId: String(fork.childSessionId), compactionId };
}

export function finishOwnedCompaction(input: {
  readonly sessionId: string;
  readonly compactionId: string;
  readonly plan: OwnedCompactionPlan;
  readonly summary: string;
  readonly blocks: readonly string[];
  readonly request: JsonObject;
}): Promise<void> {
  return appendSessionEvents(input.sessionId, [
    {
      type: "compaction/summary",
      time: Date.now(),
      data: {
        compactionId: CompactionId(input.compactionId),
        request: input.request,
        summary: { text: input.summary },
      },
    },
    {
      type: "compaction/message",
      time: Date.now(),
      data: {
        compactionId: CompactionId(input.compactionId),
        content: {
          text: input.blocks.join("\n\n"),
          blocks: [...input.blocks],
        },
      },
      surfaceOp: {
        op: "replace",
        start: input.plan.candidate.start,
        end: input.plan.candidate.end,
      },
      sourceEventSeqs: input.plan.candidate.sourceEventSeqs,
    },
    {
      type: "compaction/end",
      time: Date.now(),
      data: {
        compactionId: CompactionId(input.compactionId),
        outcome: "succeeded",
      },
    },
  ], "written");
}

export function failOwnedCompaction(input: {
  readonly sessionId: string;
  readonly compactionId: string;
  readonly outcome: "failed" | "cancelled";
  readonly error?: unknown;
}): Promise<void> {
  return appendSessionEvents(input.sessionId, [{
    type: "compaction/end",
    time: Date.now(),
    data: input.outcome === "failed"
      ? {
          compactionId: CompactionId(input.compactionId),
          outcome: "failed",
          failure: structuredProviderFailure(input.error),
        }
      : {
          compactionId: CompactionId(input.compactionId),
          outcome: "cancelled",
        },
  }], "written");
}

export async function readOwnedSession(sessionId: string): Promise<{
  readonly header: Awaited<ReturnType<typeof readAllSessionEvents>>["header"];
  readonly messages: readonly UIMessage[];
  readonly title: string;
  readonly updatedAt: number;
  readonly rigId: string;
  readonly compaction?: SessionCompaction;
  readonly compactionPolicy?: CompactionPolicyState;
}> {
  const session = await readAllSessionEvents(sessionId);
  const titleEvent = [...session.events]
    .reverse()
    .find((event) => event.type === "session/title");
  const title = titleEvent === undefined
    ? "Untitled session"
    : String((titleEvent.data as { readonly title: unknown }).title);
  const rigEvent = [...session.events]
    .reverse()
    .find((event) => event.type === "session/rig");
  const rigId = rigEvent === undefined
    ? session.header.rigId ?? "default"
    : String((rigEvent.data as { readonly rigId: unknown }).rigId ?? "default");
  return {
    header: session.header,
    messages: sessionUiMessages(session.header, session.events),
    title,
    rigId,
    updatedAt: session.events.at(-1)?.time ?? session.header.createdAt,
    ...(canonicalCompaction(session.header, session.events) === undefined
      ? {}
      : { compaction: canonicalCompaction(session.header, session.events) }),
    ...(projectCompactionPolicy(session.events) === undefined
      ? {}
      : { compactionPolicy: projectCompactionPolicy(session.events) }),
  };
}

export async function forkOwnedRerun(input: {
  readonly sessionId: ReturnType<typeof SessionId>;
  readonly eventSeq: ReturnType<typeof SessionSeq>;
}): Promise<{
  readonly childSessionId: ReturnType<typeof SessionId>;
  readonly message: UIMessage;
}> {
  const source = await readAllSessionEvents(input.sessionId);
  const selected = source.events.find(
    (event) => (event.seq as number) === (input.eventSeq as number),
  );
  if (selected?.type !== "user/message") {
    throw new Error(
      `Session ${input.sessionId} event ${input.eventSeq} is not a rerunnable user prompt`,
    );
  }
  const message = structuredClone(
    (selected.data as { readonly message: unknown }).message,
  ) as UIMessage;
  if (message.role !== "user") {
    throw new Error(
      `Session ${input.sessionId} event ${input.eventSeq} does not contain a user message`,
    );
  }
  const fork = await requiredHistory().fork({
    sessionId: input.sessionId,
    boundary: { kind: "event", seq: input.eventSeq },
    origin: "rerun",
  });
  return { childSessionId: fork.childSessionId, message };
}

export async function forkOwnedSession(
  input: ForkSessionInput,
): Promise<ReturnType<SessionHistoryCapability["fork"]> extends Promise<infer TResult> ? TResult : never> {
  return requiredHistory().fork(input);
}

export async function findOwnedMessageSeq(
  sessionId: string,
  messageId: string,
): Promise<ReturnType<typeof SessionSeq> | undefined> {
  const source = await readAllSessionEvents(sessionId);
  const event = source.events.find((candidate) => {
    if (candidate.type !== "user/message" && candidate.type !== "assistant/message") return false;
    const message = (candidate.data as { readonly message?: unknown }).message;
    return typeof message === "object" && message !== null &&
      (message as { readonly id?: unknown }).id === messageId;
  });
  return event?.seq;
}

export async function resendOwnedSessionMessage(
  sessionId: ReturnType<typeof SessionId>,
  message: UIMessage,
): Promise<void> {
  if (!sessionMessageSender) throw new Error("AI session execution host is not active");
  await sessionMessageSender(sessionId, structuredClone(message));
}

async function nextTurnAndStep(sessionId: string): Promise<{ turn: number; step: number }> {
  const { events } = await readAllSessionEvents(sessionId);
  let turn = 0;
  let step = 0;
  for (const event of events) {
    const data = event.data as Record<string, unknown>;
    if (event.type === "turn/start") turn = Math.max(turn, Number(data.turn));
    if (event.type === "step/start") step = Math.max(step, Number(data.step));
  }
  return { turn: turn + 1, step: step + 1 };
}

export interface ChatTurnHandle {
  readonly turn: ReturnType<typeof TurnId>;
  readonly step: ReturnType<typeof StepId>;
  readonly requestId: ReturnType<typeof RequestId>;
}

function structuredProviderFailure(error: unknown): JsonObject {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      readonly name?: unknown;
      readonly code?: unknown;
      readonly message?: unknown;
    };
    return {
      name: typeof candidate.name === "string" && candidate.name.length > 0
        ? candidate.name
        : "Error",
      code: typeof candidate.code === "string" && candidate.code.length > 0
        ? candidate.code
        : "PROVIDER_ERROR",
      message: typeof candidate.message === "string" && candidate.message.length > 0
        ? candidate.message
        : String(error),
    };
  }
  return {
    name: "Error",
    code: "PROVIDER_ERROR",
    message: typeof error === "string" ? error : String(error),
  };
}

async function appendForOpenHandle(
  sessionId: string,
  handle: ChatTurnHandle,
  events: readonly AppendSessionEvent[],
): Promise<"appended" | "already-closed"> {
  try {
    await appendSessionEvents(sessionId, events);
    return "appended";
  } catch (cause) {
    const canonical = await readAllSessionEvents(sessionId);
    const closed = canonical.events.some((event) => {
      if (event.type !== "step/end" && event.type !== "turn/end") return false;
      const data = event.data as unknown as Record<string, unknown>;
      if (Number(data.turn) !== Number(handle.turn)) return false;
      return event.type === "turn/end" || Number(data.step) === Number(handle.step);
    });
    if (closed) return "already-closed";
    throw cause;
  }
}

export function failChatTurn(input: {
  readonly sessionId: string;
  readonly handle: ChatTurnHandle;
  readonly attempt?: number;
  readonly error: unknown;
}): Promise<void> {
  const failure = structuredProviderFailure(input.error);
  return appendForOpenHandle(input.sessionId, input.handle, [
    {
      type: "request/failure",
      time: Date.now(),
      data: {
        requestId: input.handle.requestId,
        attempt: input.attempt ?? 1,
        failure,
      },
    },
    {
      type: "step/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        step: input.handle.step,
        reason: "provider-error",
      },
    },
    {
      type: "turn/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        reason: { kind: "provider-error", failure },
      },
    },
  ]).then(() => undefined);
}

export function abortChatTurn(input: {
  readonly sessionId: string;
  readonly handle: ChatTurnHandle;
}): Promise<void> {
  return appendForOpenHandle(input.sessionId, input.handle, [
    {
      type: "step/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        step: input.handle.step,
        reason: "aborted",
      },
    },
    {
      type: "turn/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        reason: { kind: "aborted", cause: { kind: "user" } },
      },
    },
  ]).then(() => undefined);
}

interface EffectiveChatRequestInput {
  readonly selectedModelId: string;
  readonly providerRoute: string;
  readonly providerModelId: string;
  readonly contextWindow?: number;
  readonly maxOutputTokens?: number;
  readonly reasoningEffort?: string;
  readonly instructions: string;
  readonly messages: readonly unknown[];
  readonly tools: readonly unknown[];
  readonly activeTools: readonly string[];
  readonly approvalPolicy: unknown;
}

function chatRequestEvents(
  handle: ChatTurnHandle,
  input: EffectiveChatRequestInput,
  reason: "initial" | "resume" | "step",
): readonly AppendSessionEvent[] {
  return [
    {
      type: "request/header",
      time: Date.now(),
      data: {
        ...handle,
        reason,
        header: {
          selectedModelId: input.selectedModelId,
          providerRoute: input.providerRoute,
          providerModelId: input.providerModelId,
          ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
          ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
          systemPrompt: input.instructions,
          messages: input.messages.map(jsonValue),
          tools: input.tools.map(jsonObject),
          activeTools: [...input.activeTools],
          maxSteps: 100,
          approvalPolicy: jsonObject(input.approvalPolicy),
        },
      },
    },
    {
      type: "request/context",
      time: Date.now(),
      data: {
        requestId: handle.requestId,
        providerRoute: input.providerRoute,
        providerModelId: input.providerModelId,
        selectedModelId: input.selectedModelId,
        ...(input.contextWindow === undefined ? {} : { contextWindow: input.contextWindow }),
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
      },
    },
    {
      type: "request/attempt",
      time: Date.now(),
      data: { requestId: handle.requestId, attempt: 1 },
    },
  ];
}

export function beginChatTurn(input: EffectiveChatRequestInput & {
  readonly sessionId: string;
  readonly userMessage: unknown;
}): Promise<ChatTurnHandle> {
  return enqueueSession(input.sessionId, async () => {
    const ids = await nextTurnAndStep(input.sessionId);
    const turn = TurnId(ids.turn);
    const step = StepId(ids.step);
    const requestId = RequestId(crypto.randomUUID());
    await requiredHistory().append(SessionId(input.sessionId), [
      { type: "turn/start", time: Date.now(), data: { turn, cause: "user" } },
      {
        type: "user/message",
        time: Date.now(),
        data: { turn, message: jsonObject(input.userMessage), source: "human" },
        surfaceOp: { op: "append" },
      },
      { type: "step/start", time: Date.now(), data: { turn, step } },
      ...chatRequestEvents({ turn, step, requestId }, input, "initial"),
    ], { durability: "written" });
    return { turn, step, requestId };
  });
}

export function beginNextChatStep(input: EffectiveChatRequestInput & {
  readonly sessionId: string;
  readonly previous: ChatTurnHandle;
}): Promise<ChatTurnHandle> {
  return enqueueSession(input.sessionId, async () => {
    const handle: ChatTurnHandle = {
      turn: input.previous.turn,
      step: StepId((input.previous.step as number) + 1),
      requestId: RequestId(crypto.randomUUID()),
    };
    await requiredHistory().append(SessionId(input.sessionId), [
      {
        type: "step/end",
        time: Date.now(),
        data: {
          turn: input.previous.turn,
          step: input.previous.step,
          reason: "completed",
        },
      },
      {
        type: "step/start",
        time: Date.now(),
        data: { turn: handle.turn, step: handle.step },
      },
      ...chatRequestEvents(handle, input, "step"),
    ], { durability: "written" });
    return handle;
  });
}

export function beginResumedChatTurn(input: EffectiveChatRequestInput & {
  readonly sessionId: string;
  readonly suspended: ChatTurnHandle;
}): Promise<ChatTurnHandle> {
  return enqueueSession(input.sessionId, async () => {
    const handle: ChatTurnHandle = {
      turn: input.suspended.turn,
      step: input.suspended.step,
      requestId: RequestId(crypto.randomUUID()),
    };
    await requiredHistory().append(SessionId(input.sessionId), [
      {
        type: "turn/resume",
        time: Date.now(),
        data: {
          turn: handle.turn,
          step: handle.step,
          cause: "response",
        },
      },
      ...chatRequestEvents(handle, input, "resume"),
    ], { durability: "written" });
    return handle;
  });
}

export function cancelSuspendedChatTurn(input: {
  readonly sessionId: string;
  readonly suspended: ChatTurnHandle;
}): Promise<void> {
  return appendForOpenHandle(input.sessionId, input.suspended, [
    {
      type: "turn/resume",
      time: Date.now(),
      data: {
        turn: input.suspended.turn,
        step: input.suspended.step,
        cause: "cancel",
      },
    },
    {
      type: "step/end",
      time: Date.now(),
      data: {
        turn: input.suspended.turn,
        step: input.suspended.step,
        reason: "aborted",
      },
    },
    {
      type: "turn/end",
      time: Date.now(),
      data: {
        turn: input.suspended.turn,
        reason: { kind: "aborted", cause: { kind: "user" } },
      },
    },
  ]).then(() => undefined);
}

/**
 * Opens the only legal canonical request for the current session state.
 * A suspended turn never falls through to a new user turn: it either resumes
 * after its durable human response exists or remains safely paused.
 */
export async function beginOwnedChatRequest(input: EffectiveChatRequestInput & {
  readonly sessionId: string;
  readonly userMessage: unknown;
}): Promise<ChatTurnHandle> {
  const suspension = await readOwnedSuspension(input.sessionId);
  if (!suspension) return beginChatTurn(input);
  if (!suspension.readyToResume) {
    throw new Error(
      `Session ${input.sessionId} is waiting for a response to its pending tool interaction`,
    );
  }
  return beginResumedChatTurn({
    ...input,
    suspended: suspension.handle,
  });
}

export function completeChatTurn(input: {
  readonly sessionId: string;
  readonly handle: ChatTurnHandle;
  readonly responseMessage: unknown;
  readonly finishReason: string;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number; readonly cacheReadTokens?: number };
}): Promise<void> {
  const aborted = input.finishReason === "abort";
  const responseMessage = jsonObject(input.responseMessage);
  if (typeof responseMessage.id !== "string" || responseMessage.id.length === 0) {
    return Promise.reject(
      new Error("Completed assistant response has no canonical message id"),
    );
  }
  return appendForOpenHandle(input.sessionId, input.handle, [
    {
      type: "assistant/message",
      time: Date.now(),
      data: {
        ...input.handle,
        message: responseMessage,
        finishReason: input.finishReason,
        ...(input.usage ? { usage: input.usage } : {}),
        ...(aborted ? { interrupted: true as const } : {}),
      },
      surfaceOp: { op: "append" },
    },
    {
      type: "step/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        step: input.handle.step,
        reason: aborted ? "aborted" : "completed",
      },
    },
    {
      type: "turn/end",
      time: Date.now(),
      data: {
        turn: input.handle.turn,
        reason: aborted
          ? { kind: "aborted", cause: { kind: "user" } }
          : { kind: "completed" },
      },
    },
  ]).then(() => undefined);
}

export async function settleChatProviderEnd(input: {
  readonly sessionId: string;
  readonly handle: ChatTurnHandle;
  readonly responseMessage: unknown;
  readonly finishReason: string;
  readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number; readonly cacheReadTokens?: number };
  readonly waiting?: {
    readonly callIds: readonly string[];
    readonly approvalIds: readonly string[];
  } | null;
}): Promise<"suspended" | "closed"> {
  const waiting = input.waiting;
  if (
    waiting !== undefined &&
    waiting !== null &&
    (waiting.callIds.length > 0 || waiting.approvalIds.length > 0)
  ) {
    const responseMessage = jsonObject(input.responseMessage);
    if (typeof responseMessage.id !== "string" || responseMessage.id.length === 0) {
      throw new Error("Suspended assistant response has no canonical message id");
    }
    const appended = await appendForOpenHandle(input.sessionId, input.handle, [
      {
        type: "assistant/message",
        time: Date.now(),
        data: {
          ...input.handle,
          message: responseMessage,
          finishReason: input.finishReason,
          ...(input.usage ? { usage: input.usage } : {}),
        },
        surfaceOp: { op: "append" },
      },
      {
        type: "turn/suspend",
        time: Date.now(),
        data: {
          turn: input.handle.turn,
          step: input.handle.step,
          reason: "human-input",
          callIds: waiting.callIds.map(ToolCallId),
          approvalIds: waiting.approvalIds.map(ApprovalId),
        },
      },
    ]);
    return appended === "appended" ? "suspended" : "closed";
  }
  await completeChatTurn(input);
  return "closed";
}

import type {
  AiInferenceCapability,
  AiInferenceRequest,
  AiInferenceResult,
  AiInferenceStreamRequest,
  AiInferenceStreamStep,
} from "@termco/ai-inference-base";
import {
  assertEffectiveRequestMatch,
  compareEffectiveRequests,
  parseSessionEvent,
  parseSessionHeader,
  validateSessionHistory,
  type EffectiveRequestHeader,
  type JsonObject,
  type JsonValue,
  type ParsedSessionEvent,
  type SessionHeader,
} from "@termco/session-base";

export interface ReplayScenarioSource {
  readonly scenarioId: string;
  /** First line is the current SessionHeader; every remaining line is a current SessionEvent. */
  readonly sessionJsonl: string;
  readonly overrideJson?: string;
}

export interface ReplayInferenceAdapter extends AiInferenceCapability {
  /** Returns an inference view pinned to one durable recorded session lineage. */
  bind(binding: ReplaySessionBinding): AiInferenceCapability;
  /** Fails unless every fixture bound and every derived request reached its terminal output. */
  assertConsumed(): void;
}

export type ReplaySessionBinding =
  | { readonly kind: "session"; readonly sessionId: string }
  | {
      readonly kind: "child";
      readonly parentSessionId: string;
      readonly role: string;
      readonly ordinal: number;
    };

export interface ReplayInferenceAdapterOptions {
  readonly onReady?: (marker: string) => void;
}

type RequestSemantics = JsonObject;

interface RequestScript {
  readonly requestId: string;
  readonly semantics: RequestSemantics;
  readonly outputs: readonly CanonicalReplayOutput[];
  readonly terminal: {
    readonly finishReason: string;
    readonly usage?: JsonObject;
    readonly performance?: JsonObject;
  };
}

type CanonicalReplayOutput =
  | { readonly kind: "chunk"; readonly chunk: JsonObject }
  | {
      readonly kind: "tool-call";
      readonly callId: string;
      readonly name: string;
      readonly input: JsonValue;
    }
  | {
      readonly kind: "tool-result";
      readonly callId: string;
      readonly name: string;
      readonly expected: JsonValue;
    };

type StreamPlanItem =
  | { readonly kind: "emit"; readonly value: JsonObject }
  | (Extract<CanonicalReplayOutput, { readonly kind: "tool-result" }> & {
      readonly input: JsonValue;
    });

type CallOverride =
  | {
      readonly type: "throw-before-chunk";
      readonly error: { readonly name: string; readonly code: string; readonly message: string };
    }
  | { readonly type: "hang-until-cancel"; readonly readyMarker?: string }
  | {
      readonly type: "replace";
      readonly chunks: readonly JsonObject[];
      readonly finishReason?: string;
    }
  | {
      readonly type: "patch";
      readonly chunks: readonly { readonly index: number; readonly patch: JsonObject }[];
      readonly finishReason?: string;
    };

interface ParsedOverrides {
  readonly calls: ReadonlyMap<number, CallOverride>;
  readonly configuration?: {
    readonly configuredProviderIds: string[];
    readonly configuredCustomEndpointIds: string[];
  };
}

interface ScenarioScript {
  readonly scenarioId: string;
  readonly header: SessionHeader;
  readonly events: readonly ParsedSessionEvent[];
  bindingKey: string;
  readonly requests: readonly RequestScript[];
  readonly auxiliaries: readonly AuxiliaryScript[];
  readonly overrides: ReadonlyMap<number, CallOverride>;
  readonly configuration?: ParsedOverrides["configuration"];
  bound: boolean;
  inFlight: boolean;
  consumedRequests: number;
}

interface AuxiliaryScript {
  readonly semantics: RequestSemantics;
  readonly result: AiInferenceResult;
  consumed: boolean;
}

function replayError(code: string, message: string): Error & { readonly code: string } {
  const error = new Error(message) as Error & { code: string };
  error.name = "ReplayInferenceError";
  error.code = code;
  return error;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw replayError("INVALID_FIXTURE", "canonical replay data must be an object");
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) {
    throw replayError("INVALID_OVERRIDE", `${path}.${unexpected} is not part of the replay override contract`);
  }
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value) {
    throw replayError("INVALID_OVERRIDE", `${path} must be a non-empty string`);
  }
  return value;
}

function parseOverrides(
  scenarioId: string,
  source: string | undefined,
  requests: readonly RequestScript[],
): ParsedOverrides {
  if (source === undefined) return { calls: new Map() };
  let decoded: unknown;
  try {
    decoded = JSON.parse(source) as unknown;
  } catch (cause) {
    throw replayError("INVALID_OVERRIDE", `scenario ${scenarioId} replay.override.json is invalid: ${String(cause)}`);
  }
  const root = record(decoded);
  exactKeys(root, ["calls", "configuration"], "override");
  if (root.calls !== undefined && !Array.isArray(root.calls)) {
    throw replayError("INVALID_OVERRIDE", "override.calls must be an array");
  }
  const result = new Map<number, CallOverride>();
  (root.calls ?? []).forEach((candidate, overrideIndex) => {
    const path = `override.calls[${overrideIndex}]`;
    const entry = record(candidate);
    exactKeys(entry, ["index", "requestId", "action"], path);
    const explicitIndex = entry.index;
    if (explicitIndex !== undefined && (!Number.isSafeInteger(explicitIndex) || (explicitIndex as number) < 0)) {
      throw replayError("INVALID_OVERRIDE", `${path}.index must be a non-negative integer`);
    }
    const explicitRequestId = entry.requestId === undefined
      ? undefined
      : requiredString(entry.requestId, `${path}.requestId`);
    if (explicitIndex === undefined && explicitRequestId === undefined) {
      throw replayError("INVALID_OVERRIDE", `${path} requires index or requestId`);
    }
    const matches = requests
      .map((request, index) => ({ request, index }))
      .filter(({ request, index }) =>
        (explicitIndex === undefined || explicitIndex === index) &&
        (explicitRequestId === undefined || explicitRequestId === request.requestId),
      );
    if (matches.length !== 1) {
      throw replayError("INVALID_OVERRIDE", `${path} does not identify exactly one canonical request`);
    }
    const index = matches[0]!.index;
    if (result.has(index)) {
      throw replayError("INVALID_OVERRIDE", `${path} targets a request already overridden`);
    }
    const action = record(entry.action);
    const type = requiredString(action.type, `${path}.action.type`);
    if (type === "throw-before-chunk") {
      exactKeys(action, ["type", "error"], `${path}.action`);
      const error = record(action.error);
      exactKeys(error, ["name", "code", "message"], `${path}.action.error`);
      result.set(index, {
        type,
        error: {
          name: requiredString(error.name, `${path}.action.error.name`),
          code: requiredString(error.code, `${path}.action.error.code`),
          message: requiredString(error.message, `${path}.action.error.message`),
        },
      });
      return;
    }
    if (type === "hang-until-cancel") {
      exactKeys(action, ["type", "readyMarker"], `${path}.action`);
      result.set(index, {
        type,
        ...(action.readyMarker === undefined
          ? {}
          : { readyMarker: requiredString(action.readyMarker, `${path}.action.readyMarker`) }),
      });
      return;
    }
    if (type === "replace") {
      exactKeys(action, ["type", "chunks", "finishReason"], `${path}.action`);
      if (!Array.isArray(action.chunks)) {
        throw replayError("INVALID_OVERRIDE", `${path}.action.chunks must be an array`);
      }
      result.set(index, {
        type,
        chunks: action.chunks.map((chunk, chunkIndex) =>
          jsonValue(chunk, `${path}.action.chunks[${chunkIndex}]`) as JsonObject),
        ...(action.finishReason === undefined
          ? {}
          : { finishReason: requiredString(action.finishReason, `${path}.action.finishReason`) }),
      });
      return;
    }
    if (type === "patch") {
      exactKeys(action, ["type", "chunks", "finishReason"], `${path}.action`);
      if (!Array.isArray(action.chunks)) {
        throw replayError("INVALID_OVERRIDE", `${path}.action.chunks must be an array`);
      }
      const seen = new Set<number>();
      const chunks = action.chunks.map((chunk, chunkIndex) => {
        const chunkPath = `${path}.action.chunks[${chunkIndex}]`;
        const entry = record(chunk);
        exactKeys(entry, ["index", "patch"], chunkPath);
        if (!Number.isSafeInteger(entry.index) || (entry.index as number) < 0) {
          throw replayError("INVALID_OVERRIDE", `${chunkPath}.index must be a non-negative integer`);
        }
        const target = entry.index as number;
        if (seen.has(target)) {
          throw replayError("INVALID_OVERRIDE", `${chunkPath}.index repeats ${target}`);
        }
        seen.add(target);
        return {
          index: target,
          patch: jsonValue(entry.patch, `${chunkPath}.patch`) as JsonObject,
        };
      });
      result.set(index, {
        type,
        chunks,
        ...(action.finishReason === undefined
          ? {}
          : { finishReason: requiredString(action.finishReason, `${path}.action.finishReason`) }),
      });
      return;
    }
    throw replayError("INVALID_OVERRIDE", `${path}.action.type is unsupported: ${type}`);
  });
  let configuration: ParsedOverrides["configuration"];
  if (root.configuration !== undefined) {
    const value = record(root.configuration);
    exactKeys(value, ["configuredProviderIds", "configuredCustomEndpointIds"], "override.configuration");
    const stringArray = (candidate: unknown, path: string): string[] => {
      if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string" || !item)) {
        throw replayError("INVALID_OVERRIDE", `${path} must be an array of non-empty strings`);
      }
      return [...candidate] as string[];
    };
    configuration = {
      configuredProviderIds: stringArray(
        value.configuredProviderIds,
        "override.configuration.configuredProviderIds",
      ),
      configuredCustomEndpointIds: stringArray(
        value.configuredCustomEndpointIds,
        "override.configuration.configuredCustomEndpointIds",
      ),
    };
  }
  return { calls: result, ...(configuration === undefined ? {} : { configuration }) };
}

function jsonValue(value: unknown, path: string): JsonValue {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error("not JSON");
    return JSON.parse(serialized) as JsonValue;
  } catch (cause) {
    throw replayError("INVALID_LIVE_REQUEST", `${path} is not lossless JSON: ${String(cause)}`);
  }
}

const LIVE_PLACEHOLDER = /^\{\{live:(\/.*)\}\}$/;

function pointerValue(root: JsonValue, pointer: string): JsonValue {
  let current: JsonValue = root;
  for (const rawToken of pointer.slice(1).split("/")) {
    const token = rawToken.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= current.length) {
        throw replayError("INVALID_PLACEHOLDER", `live request pointer ${pointer} does not exist`);
      }
      current = current[Number(token)]!;
    } else if (typeof current === "object" && current !== null && token in current) {
      current = (current as JsonObject)[token]!;
    } else {
      throw replayError("INVALID_PLACEHOLDER", `live request pointer ${pointer} does not exist`);
    }
  }
  return current;
}

function materializePlaceholders(
  value: JsonValue,
  liveRequest: JsonValue,
  bindings: Map<string, JsonValue>,
): JsonValue {
  if (typeof value === "string") {
    const placeholder = LIVE_PLACEHOLDER.exec(value);
    if (!placeholder) return value;
    const existing = bindings.get(value);
    if (existing !== undefined) return existing;
    const resolved = pointerValue(liveRequest, placeholder[1]!);
    bindings.set(value, resolved);
    return resolved;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => materializePlaceholders(item, liveRequest, bindings));
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    materializePlaceholders(child, liveRequest, bindings),
  ]));
}

function parseScenario(source: ReplayScenarioSource): ScenarioScript {
  if (!source.scenarioId.trim()) {
    throw replayError("INVALID_FIXTURE", "replay scenario id is required");
  }
  if (!source.sessionJsonl.trim()) {
    throw replayError("MISSING_FIXTURE", `scenario ${source.scenarioId} has no session.jsonl`);
  }
  const lines = source.sessionJsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw replayError("INVALID_FIXTURE", `scenario ${source.scenarioId} has no canonical events`);
  }
  let decoded: unknown[];
  try {
    decoded = lines.map((line) => JSON.parse(line) as unknown);
  } catch (cause) {
    throw replayError("INVALID_FIXTURE", `scenario ${source.scenarioId} contains invalid JSON: ${String(cause)}`);
  }
  const header = parseSessionHeader(decoded[0]);
  const events = decoded.slice(1).map((event) => parseSessionEvent(event));
  validateSessionHistory(events);
  const requests = deriveRequests(source.scenarioId, events);
  if (requests.length === 0) {
    throw replayError("INVALID_FIXTURE", `scenario ${source.scenarioId} contains no request/header`);
  }
  const overrides = parseOverrides(source.scenarioId, source.overrideJson, requests);
  return {
    scenarioId: source.scenarioId,
    header,
    events,
    bindingKey: `session:${header.id}`,
    requests,
    auxiliaries: deriveAuxiliaries(source.scenarioId, events),
    overrides: overrides.calls,
    ...(overrides.configuration === undefined ? {} : { configuration: overrides.configuration }),
    bound: false,
    inFlight: false,
    consumedRequests: 0,
  };
}

function bindingKey(binding: ReplaySessionBinding): string {
  if (binding.kind === "session") {
    if (!binding.sessionId) throw replayError("INVALID_BINDING", "session binding id is required");
    return `session:${binding.sessionId}`;
  }
  if (!binding.parentSessionId || !binding.role ||
      !Number.isSafeInteger(binding.ordinal) || binding.ordinal < 0) {
    throw replayError("INVALID_BINDING", "child binding requires parentSessionId, role, and non-negative ordinal");
  }
  return `child:${binding.parentSessionId}:${binding.role}:${binding.ordinal}`;
}

function assignLineageBindings(scripts: readonly ScenarioScript[]): void {
  const bySession = new Map(scripts.map((script) => [String(script.header.id), script]));
  for (const script of scripts) {
    const parentId = script.header.parent?.sessionId;
    if (parentId === undefined) continue;
    const parent = bySession.get(String(parentId));
    if (!parent) {
      throw replayError(
        "MISSING_PARENT_FIXTURE",
        `child scenario ${script.scenarioId} has no parent session fixture ${parentId}`,
      );
    }
    const starts = parent.events.flatMap((event) => {
      if (event.type !== "subagent/start") return [];
      const data = record(event.data);
      const request = record(data.request);
      const role = typeof request.role === "string" ? request.role : undefined;
      return role === undefined
        ? []
        : [{ childSessionId: String(data.childSessionId), role }];
    });
    const creation = starts.find((start) => start.childSessionId === String(script.header.id));
    if (!creation) {
      throw replayError(
        "MISSING_CHILD_CREATION",
        `parent ${parentId} has no role-bearing subagent/start for child ${script.header.id}`,
      );
    }
    const ordinal = starts
      .slice(0, starts.indexOf(creation))
      .filter((start) => start.role === creation.role)
      .length;
    script.bindingKey = `child:${parentId}:${creation.role}:${ordinal}`;
  }
  const duplicates = scripts.find((script, index) =>
    scripts.findIndex((candidate) => candidate.bindingKey === script.bindingKey) !== index);
  if (duplicates) {
    throw replayError("DUPLICATE_BINDING", `replay lineage binding is not unique: ${duplicates.bindingKey}`);
  }
}

const REPLAY_BOUND_SCENARIO = Symbol("replay-bound-scenario");
type BoundStreamRequest = AiInferenceStreamRequest & {
  readonly [REPLAY_BOUND_SCENARIO]?: ScenarioScript;
};

function deriveAuxiliaries(
  scenarioId: string,
  events: readonly ParsedSessionEvent[],
): readonly AuxiliaryScript[] {
  return events.flatMap((event) => {
    if (event.type !== "adapter/event") return [];
    const data = record(event.data);
    if (data.adapter !== "ai-inference-replay-native" || data.kind !== "auxiliary/generate") {
      return [];
    }
    const payload = record(data.payload);
    exactKeys(payload, ["request", "result"], `scenario ${scenarioId} auxiliary payload`);
    const request = record(payload.request);
    if (request.kind !== "ai.inference.generate") {
      throw replayError(
        "INVALID_FIXTURE",
        `scenario ${scenarioId} auxiliary request must use kind ai.inference.generate`,
      );
    }
    const { kind: _kind, ...semantics } = request;
    const result = record(payload.result);
    exactKeys(result, ["text", "stepCount", "durationMs"], `scenario ${scenarioId} auxiliary result`);
    if (typeof result.text !== "string" ||
        !Number.isSafeInteger(result.stepCount) || (result.stepCount as number) < 0 ||
        typeof result.durationMs !== "number" || !Number.isFinite(result.durationMs) || result.durationMs < 0) {
      throw replayError("INVALID_FIXTURE", `scenario ${scenarioId} has an invalid auxiliary result`);
    }
    return [{
      semantics: jsonValue(semantics, `scenario ${scenarioId} auxiliary request`) as JsonObject,
      result: {
        text: result.text,
        stepCount: result.stepCount as number,
        durationMs: result.durationMs,
      },
      consumed: false,
    }];
  });
}

function requestSemantics(header: EffectiveRequestHeader): RequestSemantics {
  return {
    modelId: header.selectedModelId,
    instructions: header.systemPrompt,
    messages: header.messages,
    tools: header.tools.map((candidate) => {
      const tool = candidate as JsonObject;
      return {
        name: tool.name ?? null,
        description: tool.description ?? null,
        inputSchema: tool.schema ?? null,
      };
    }),
    activeTools: header.activeTools,
    reasoningEffort: header.reasoningEffort ?? null,
    providerOptions: header.providerOptions ?? null,
    maxSteps: header.maxSteps ?? null,
    chunkTimeoutMs: header.chunkTimeoutMs ?? null,
  };
}

function deriveRequests(
  scenarioId: string,
  events: readonly ParsedSessionEvent[],
): readonly RequestScript[] {
  const scripts: RequestScript[] = [];
  for (const event of events) {
    if (event.type !== "request/header") continue;
    const data = record(event.data);
    const requestId = String(data.requestId);
    const header = data.header as unknown as EffectiveRequestHeader;
    const owned = events.filter((candidate) => {
      if (candidate.type !== "request/header" &&
          candidate.type !== "request/context" &&
          candidate.type !== "request/attempt" &&
          candidate.type !== "request/failure" &&
          candidate.type !== "assistant/chunk" &&
          candidate.type !== "assistant/message" &&
          candidate.type !== "tool/call") {
        return false;
      }
      const candidateData = record(candidate.data);
      return candidateData.requestId === requestId;
    });
    const terminalEvent = owned.find((candidate) => candidate.type === "assistant/message");
    if (!terminalEvent) {
      throw replayError(
        "MISSING_TERMINAL_FINISH",
        `scenario ${scenarioId} request ${requestId} has no terminal assistant/message`,
      );
    }
    const terminal = record(terminalEvent.data);
    const toolCalls = owned
      .filter((candidate) => candidate.type === "tool/call")
      .map((candidate) => {
        const call = record(candidate.data);
        return {
          callId: String(call.callId),
          name: String(call.name),
          input: call.parsedInput === undefined
            ? parseRawToolArguments(call.rawArguments, requestId)
            : call.parsedInput as JsonValue,
        };
      });
    const callsById = new Map(toolCalls.map((call) => [call.callId, call]));
    const outputs: CanonicalReplayOutput[] = [];
    for (const candidate of events) {
      if ((candidate.seq as number) <= (event.seq as number) ||
          (candidate.seq as number) >= (terminalEvent.seq as number)) continue;
      const candidateData = record(candidate.data);
      if (candidate.type === "assistant/chunk" && candidateData.requestId === requestId) {
        outputs.push({ kind: "chunk", chunk: candidateData.chunk as JsonObject });
      } else if (candidate.type === "tool/call" && candidateData.requestId === requestId) {
        const call = callsById.get(String(candidateData.callId))!;
        outputs.push({ kind: "tool-call", ...call });
      } else if (candidate.type === "tool/result") {
        const call = callsById.get(String(candidateData.callId));
        if (call) {
          outputs.push({
            kind: "tool-result",
            callId: call.callId,
            name: call.name,
            expected: candidateData.canonicalOutput as JsonValue,
          });
        }
      }
    }
    scripts.push({
      requestId,
      semantics: requestSemantics(header),
      outputs,
      terminal: {
        finishReason: String(terminal.finishReason),
        ...(terminal.usage === undefined ? {} : { usage: terminal.usage as JsonObject }),
        ...(terminal.performance === undefined
          ? {}
          : { performance: terminal.performance as JsonObject }),
      },
    });
  }
  return scripts;
}

function parseRawToolArguments(value: unknown, requestId: string): JsonValue {
  try {
    return jsonValue(JSON.parse(String(value)), `request ${requestId} tool arguments`);
  } catch (cause) {
    if (cause instanceof Error && cause.name === "ReplayInferenceError") throw cause;
    throw replayError(
      "INVALID_FIXTURE",
      `request ${requestId} has tool arguments that are not JSON: ${String(cause)}`,
    );
  }
}

function liveRequestSemantics(request: AiInferenceStreamRequest): RequestSemantics {
  const tools = Object.entries(request.tools).map(([name, candidate]) => {
    const definition = record(candidate);
    return {
      name,
      description: typeof definition.description === "string" ? definition.description : null,
      inputSchema: definition.inputSchema === undefined
        ? null
        : jsonValue(definition.inputSchema, `tools.${name}.inputSchema`),
    };
  });
  return {
    modelId: request.modelId,
    instructions: jsonValue(request.instructions ?? null, "instructions"),
    messages: jsonValue(request.messages, "messages"),
    tools,
    activeTools: jsonValue(request.activeTools ?? Object.keys(request.tools), "activeTools"),
    reasoningEffort: request.reasoningEffort ?? null,
    providerOptions: jsonValue(request.providerOptions ?? null, "providerOptions"),
    maxSteps: request.maxSteps,
    chunkTimeoutMs: request.chunkTimeoutMs ?? null,
  };
}

function liveGenerateSemantics(request: AiInferenceRequest): RequestSemantics {
  return {
    modelId: request.modelId,
    instructions: request.instructions,
    prompt: request.prompt,
    tools: Object.entries(request.tools ?? {}).map(([name, candidate]) => ({
      name,
      description: candidate.description ?? null,
      inputSchema: jsonValue(candidate.inputSchema, `tools.${name}.inputSchema`),
    })),
    maxSteps: request.maxSteps,
    maxOutputTokens: request.maxOutputTokens ?? null,
    temperature: request.temperature ?? null,
    providerOptions: jsonValue(request.providerOptions ?? null, "providerOptions"),
    chunkTimeoutMs: request.chunkTimeoutMs ?? null,
    totalTimeoutMs: request.totalTimeoutMs ?? null,
  };
}

function streamPlan(
  script: RequestScript,
  liveRequest: JsonValue,
  bindings: Map<string, JsonValue>,
): { readonly parts: readonly StreamPlanItem[]; readonly materializedScript: RequestScript } {
  const materializedOutputs = materializePlaceholders(
    script.outputs as unknown as JsonValue,
    liveRequest,
    bindings,
  ) as unknown as readonly CanonicalReplayOutput[];
  const parts: StreamPlanItem[] = [];
  const callsById = new Map(materializedOutputs.flatMap((output) =>
    output.kind === "tool-call" ? [[output.callId, output] as const] : []));
  const opened = new Map<string, "text" | "reasoning">();
  const closeOpened = (): void => {
    for (const [id, family] of opened) {
      parts.push({ kind: "emit", value: { type: `${family}-end`, id } });
    }
    opened.clear();
  };
  for (const output of materializedOutputs) {
    if (output.kind === "tool-call") {
      closeOpened();
      parts.push({
        kind: "emit",
        value: {
          type: "tool-call",
          toolCallId: output.callId,
          toolName: output.name,
          input: output.input,
        },
      });
      continue;
    }
    if (output.kind === "tool-result") {
      closeOpened();
      parts.push({
        ...output,
        input: callsById.get(output.callId)?.input ?? null,
      });
      continue;
    }
    const chunk = output.chunk;
    const kind = chunk.kind;
    if (kind !== "text-delta" && kind !== "reasoning-delta") {
      throw replayError(
        "UNSUPPORTED_CANONICAL_CHUNK",
        `request ${script.requestId} has unsupported canonical chunk ${String(kind)}`,
      );
    }
    const id = typeof chunk.id === "string" && chunk.id ? chunk.id : `${kind}:${script.requestId}`;
    const family = kind === "text-delta" ? "text" : "reasoning";
    if (!opened.has(id)) {
      opened.set(id, family);
      parts.push({ kind: "emit", value: { type: `${family}-start`, id } });
    } else if (opened.get(id) !== family) {
      throw replayError("INVALID_FIXTURE", `chunk id ${id} changes stream family`);
    }
    parts.push({
      kind: "emit",
      value: { type: kind, id, text: typeof chunk.delta === "string" ? chunk.delta : "" },
    });
  }
  closeOpened();
  parts.push({
    kind: "emit",
    value: {
      type: "finish-step",
      finishReason: script.terminal.finishReason,
      ...(script.terminal.usage === undefined ? {} : { usage: script.terminal.usage }),
    },
  });
  parts.push({
    kind: "emit",
    value: { type: "finish", finishReason: script.terminal.finishReason },
  });
  return {
    parts,
    materializedScript: { ...script, outputs: materializedOutputs },
  };
}

function stepResult(script: RequestScript): AiInferenceStreamStep {
  const text = script.outputs
    .filter((output): output is Extract<CanonicalReplayOutput, { kind: "chunk" }> =>
      output.kind === "chunk" && output.chunk.kind === "text-delta")
    .map((output) => typeof output.chunk.delta === "string" ? output.chunk.delta : "")
    .join("");
  const calls = script.outputs.filter(
    (output): output is Extract<CanonicalReplayOutput, { kind: "tool-call" }> => output.kind === "tool-call",
  );
  const results = script.outputs.filter(
    (output): output is Extract<CanonicalReplayOutput, { kind: "tool-result" }> => output.kind === "tool-result",
  );
  const usage = script.terminal.usage;
  const performance = script.terminal.performance;
  return {
    ...(text ? { text } : {}),
    ...(calls.length === 0
      ? {}
      : { toolCalls: calls.map((call) => ({ toolName: call.name, input: call.input })) }),
    ...(results.length === 0
      ? {}
      : { toolResults: results.map((result) => ({ toolName: result.name, output: result.expected })) }),
    ...(usage === undefined
      ? {}
      : {
          usage: {
            ...(typeof usage.inputTokens === "number" ? { inputTokens: usage.inputTokens } : {}),
            ...(typeof usage.outputTokens === "number" ? { outputTokens: usage.outputTokens } : {}),
            ...(typeof usage.cacheReadTokens === "number"
              ? { inputTokenDetails: { cacheReadTokens: usage.cacheReadTokens } }
              : {}),
          },
        }),
    ...(performance === undefined
      ? {}
      : {
          performance: {
            ...(typeof performance.outputTokensPerSecond === "number"
              ? { outputTokensPerSecond: performance.outputTokensPerSecond }
              : {}),
            ...(typeof performance.timeToFirstTokenMs === "number"
              ? { timeToFirstOutputMs: performance.timeToFirstTokenMs }
              : {}),
          },
        }),
  };
}

function applyOutputOverride(script: RequestScript, override: CallOverride | undefined): RequestScript {
  if (override?.type !== "replace" && override?.type !== "patch") return script;
  let outputs: readonly CanonicalReplayOutput[];
  if (override.type === "replace") {
    outputs = override.chunks.map((chunk) => ({ kind: "chunk" as const, chunk }));
  } else {
    const patches = new Map(override.chunks.map((patch) => [patch.index, patch.patch]));
    let chunkIndex = 0;
    outputs = script.outputs.map((output) => {
      if (output.kind !== "chunk") return output;
      const patch = patches.get(chunkIndex);
      chunkIndex += 1;
      return patch === undefined
        ? output
        : { kind: "chunk" as const, chunk: { ...output.chunk, ...patch } };
    });
    const outOfRange = [...patches.keys()].find((index) => index >= chunkIndex);
    if (outOfRange !== undefined) {
      throw replayError(
        "INVALID_OVERRIDE",
        `request ${script.requestId} chunk patch index ${outOfRange} is out of range`,
      );
    }
  }
  return {
    ...script,
    outputs,
    terminal: {
      ...script.terminal,
      ...(override.finishReason === undefined ? {} : { finishReason: override.finishReason }),
    },
  };
}

export function createReplayInferenceAdapter(
  sources: readonly ReplayScenarioSource[],
  options: ReplayInferenceAdapterOptions = {},
): ReplayInferenceAdapter {
  const scripts = sources.map(parseScenario);
  if (new Set(scripts.map((script) => script.scenarioId)).size !== scripts.length) {
    throw replayError("DUPLICATE_SCENARIO", "replay scenario ids must be unique");
  }
  assignLineageBindings(scripts);
  const configured = scripts.flatMap((script) => script.configuration ? [script.configuration] : []);
  if (configured.length > 1) {
    const first = jsonValue(configured[0], "replay configuration");
    if (configured.some((item) => !compareEffectiveRequests(first, item).equal)) {
      throw replayError("CONFLICTING_CONFIGURATION", "scenario provider configurations must be identical");
    }
  }
  const configuration = configured[0] ?? {
    configuredProviderIds: ["deterministic-replay"],
    configuredCustomEndpointIds: [],
  };

  const adapter: ReplayInferenceAdapter = {
    configuration: async () => structuredClone(configuration),
    async generate(request) {
      const actual = liveGenerateSemantics(request);
      const candidates = scripts.flatMap((scenario) =>
        scenario.auxiliaries
          .filter((auxiliary) => !auxiliary.consumed && compareEffectiveRequests(auxiliary.semantics, actual).equal)
          .map((auxiliary) => ({ scenario, auxiliary })),
      );
      if (candidates.length === 0) {
        const expected = scripts.flatMap((scenario) => scenario.auxiliaries).find((item) => !item.consumed);
        if (expected) assertEffectiveRequestMatch(expected.semantics, actual);
        const hasAuxiliary = scripts.some((scenario) => scenario.auxiliaries.length > 0);
        throw replayError(
          hasAuxiliary ? "EXTRA_REQUEST" : "MISSING_SCRIPT",
          hasAuxiliary
            ? "live auxiliary inference call exceeds the recorded script"
            : "no explicitly marked auxiliary replay request exists",
        );
      }
      if (candidates.length > 1) {
        throw replayError(
          "AMBIGUOUS_SCRIPT",
          `auxiliary request matches multiple scenarios: ${candidates.map(({ scenario }) => scenario.scenarioId).join(", ")}`,
        );
      }
      const selected = candidates[0]!;
      selected.scenario.bound = true;
      selected.auxiliary.consumed = true;
      return structuredClone(selected.auxiliary.result);
    },
    async stream(request) {
      const actual = liveRequestSemantics(request);
      const forcedScenario = (request as BoundStreamRequest)[REPLAY_BOUND_SCENARIO];
      const candidates = scripts.flatMap((scenario) => {
        if (forcedScenario !== undefined && scenario !== forcedScenario) return [];
        const next = scenario.requests[scenario.consumedRequests];
        if (scenario.inFlight || next === undefined) return [];
        const bindings = new Map<string, JsonValue>();
        const expected = materializePlaceholders(next.semantics, actual, bindings) as JsonObject;
        return compareEffectiveRequests(expected, actual).equal
          ? [{ scenario, script: next, bindings }]
          : [];
      });
      if (candidates.length === 0) {
        const expected = scripts
          .filter((scenario) =>
            !scenario.inFlight && (forcedScenario === undefined || scenario === forcedScenario))
          .map((scenario) => scenario.requests[scenario.consumedRequests])
          .find((candidate) => candidate !== undefined);
        if (expected) {
          const bindings = new Map<string, JsonValue>();
          assertEffectiveRequestMatch(
            materializePlaceholders(expected.semantics, actual, bindings),
            actual,
          );
        }
        throw replayError("EXTRA_REQUEST", "live inference request has no available replay script");
      }
      if (candidates.length > 1) {
        throw replayError(
          "AMBIGUOUS_SCRIPT",
          `live inference request matches multiple scenarios: ${candidates.map((item) => item.scenario.scenarioId).join(", ")}`,
        );
      }
      const selected = candidates[0]!;
      const scenario = selected.scenario;
      scenario.bound = true;
      scenario.inFlight = true;
      const requestIndex = scenario.consumedRequests;
      const script = selected.script;
      const override = scenario.overrides.get(requestIndex);
      const consume = (): void => {
        scenario.inFlight = false;
        scenario.consumedRequests += 1;
      };
      if (override?.type === "throw-before-chunk") {
        consume();
        const failure = new Error(override.error.message) as Error & { code: string };
        failure.name = override.error.name;
        failure.code = override.error.code;
        throw failure;
      }
      if (override?.type === "hang-until-cancel") {
        let settled = false;
        let detach = (): void => undefined;
        const settle = (): void => {
          if (settled) return;
          settled = true;
          detach();
          consume();
          request.onAbort?.();
        };
        return {
          stream: new ReadableStream<unknown>({
            start(controller) {
              if (override.readyMarker !== undefined) options.onReady?.(override.readyMarker);
              const abort = (): void => {
                settle();
                controller.error(new DOMException("Replay inference cancelled", "AbortError"));
              };
              if (request.abortSignal?.aborted) {
                abort();
                return;
              }
              request.abortSignal?.addEventListener("abort", abort, { once: true });
              detach = () => request.abortSignal?.removeEventListener("abort", abort);
            },
            cancel() {
              settle();
            },
          }),
        };
      }
      const effectiveScript = applyOutputOverride(script, override);
      const plan = streamPlan(effectiveScript, actual, selected.bindings);
      const parts = plan.parts;
      let index = 0;
      return {
        stream: new ReadableStream<unknown>({
          async pull(controller) {
            const part = parts[index];
            if (part !== undefined) {
              index += 1;
              if (part.kind === "emit") {
                controller.enqueue(part.value);
              } else {
                const definition = record(request.tools[part.name]);
                const execute = definition.execute;
                let output = part.expected;
                if (typeof execute === "function") {
                  output = jsonValue(await execute(
                    part.input,
                    {
                      toolCallId: part.callId,
                      messages: request.messages,
                      abortSignal: request.abortSignal,
                    },
                  ), `tool ${part.name} output`);
                  const comparison = compareEffectiveRequests(part.expected, output);
                  if (!comparison.equal) {
                    throw replayError(
                      "TOOL_RESULT_MISMATCH",
                      `tool ${part.name} output diverges at ${comparison.path} (${comparison.reason})`,
                    );
                  }
                }
                controller.enqueue({
                  type: "tool-result",
                  toolCallId: part.callId,
                  toolName: part.name,
                  output,
                });
              }
            }
            if (index === parts.length) {
              controller.close();
              consume();
              request.onStepEnd?.(stepResult(plan.materializedScript));
              request.onEnd?.({ finishReason: effectiveScript.terminal.finishReason });
            }
          },
          cancel() {
            scenario.inFlight = false;
            request.onAbort?.();
          },
        }),
      };
    },
    bind(binding) {
      const key = bindingKey(binding);
      const scenario = scripts.find((candidate) => candidate.bindingKey === key);
      if (!scenario) {
        throw replayError("MISSING_SCRIPT", `no replay scenario is bound to ${key}`);
      }
      return {
        configuration: () => adapter.configuration(),
        generate: (request) => adapter.generate(request),
        stream(request) {
          const bound = { ...request } as BoundStreamRequest & Record<PropertyKey, unknown>;
          Object.defineProperty(bound, REPLAY_BOUND_SCENARIO, {
            value: scenario,
            enumerable: false,
          });
          return adapter.stream(bound);
        },
      };
    },
    assertConsumed() {
      const unbound = scripts.filter((scenario) => !scenario.bound);
      if (unbound.length > 0) {
        throw replayError(
          "UNBOUND_SCRIPT",
          `replay scenarios never bound: ${unbound.map((item) => item.scenarioId).join(", ")}`,
        );
      }
      const incomplete = scripts.filter(
        (scenario) => scenario.consumedRequests !== scenario.requests.length,
      );
      if (incomplete.length > 0) {
        throw replayError(
          "UNCONSUMED_REQUEST",
          `replay scenarios have unconsumed requests: ${incomplete
            .map((item) => `${item.scenarioId} (${item.requests.length - item.consumedRequests})`)
            .join(", ")}`,
        );
      }
      const incompleteAuxiliaries = scripts.filter((scenario) =>
        scenario.auxiliaries.some((auxiliary) => !auxiliary.consumed));
      if (incompleteAuxiliaries.length > 0) {
        throw replayError(
          "UNCONSUMED_AUXILIARY",
          `replay scenarios have unconsumed auxiliary requests: ${incompleteAuxiliaries
            .map((item) => item.scenarioId)
            .join(", ")}`,
        );
      }
    },
  };
  return adapter;
}

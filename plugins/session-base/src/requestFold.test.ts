import { describe, expect, it } from "vitest";
import {
  compareEffectiveRequests,
  foldRequestHeader,
  parseSessionEvent,
  serializeEffectiveRequest,
  type EffectiveRequestHeader,
  type ParsedSessionEvent,
} from "./index";

const time = 1_777_777_777_777;

function header(overrides: Partial<EffectiveRequestHeader> = {}): EffectiveRequestHeader {
  return {
    selectedModelId: "selected-model",
    providerRoute: "openrouter",
    providerModelId: "provider/model",
    reasoningEffort: "high",
    maxOutputTokens: 16_384,
    temperature: 0.2,
    topP: 0.9,
    topK: 40,
    stop: ["<end>"],
    seed: 42,
    providerOptions: { beta: true, nested: { alpha: 1, zeta: 2 } },
    systemPrompt: "You are Termco.",
    messages: [{ role: "user", content: "hello" }],
    tools: [
      {
        name: "calculator",
        schema: { type: "object", properties: { expression: { type: "string" } } },
        contributor: { pluginId: "calculator-native", revision: "1" },
      },
    ],
    activeTools: ["calculator"],
    maxSteps: 8,
    chunkTimeoutMs: 30_000,
    totalTimeoutMs: 120_000,
    approvalPolicy: { mode: "allow-safe", revision: "policy-1" },
    provenance: [{ pluginId: "ai-chat-native", revision: "1", contributionId: "system-prompt" }],
    ...overrides,
  };
}

function requestEvent(
  seq: number,
  requestId: string,
  effectiveHeader: EffectiveRequestHeader,
): ParsedSessionEvent {
  return parseSessionEvent({
    type: "request/header",
    seq,
    time: time + seq,
    data: {
      turn: 1,
      step: seq + 1,
      requestId,
      reason: seq === 0 ? "initial" : "step",
      header: effectiveHeader,
    },
  });
}

function contextEvent(
  seq: number,
  requestId: string,
  overrides: Record<string, unknown> = {},
): ParsedSessionEvent {
  return parseSessionEvent({
    type: "request/context",
    seq,
    time: time + seq,
    data: {
      requestId,
      providerRoute: "openrouter",
      providerModelId: "provider/model",
      selectedModelId: "selected-model",
      contextWindow: 1_000_000,
      maxOutputTokens: 16_384,
      adapterDefaults: { stream: true },
      ...overrides,
    },
  });
}

describe("exact request folding", () => {
  it("folds the initial request and its resolved provider context", () => {
    const events = [requestEvent(0, "request-1", header()), contextEvent(1, "request-1")];

    expect(foldRequestHeader(events)).toMatchObject({
      requestId: "request-1",
      turn: 1,
      step: 1,
      headerSeq: 0,
      contextSeq: 1,
      header: { maxOutputTokens: 16_384, reasoningEffort: "high" },
      context: { contextWindow: 1_000_000, maxOutputTokens: 16_384 },
    });
  });

  it("selects the latest complete header at a boundary, including unchanged reuse", () => {
    const unchanged = header();
    const changed = header({ selectedModelId: "new-model", maxOutputTokens: 32_768 });
    const events = [
      requestEvent(0, "request-1", unchanged),
      contextEvent(1, "request-1"),
      requestEvent(2, "request-2", unchanged),
      contextEvent(3, "request-2"),
      requestEvent(4, "request-3", changed),
      contextEvent(5, "request-3", {
        selectedModelId: "new-model",
        providerModelId: "provider/new-model",
        maxOutputTokens: 32_768,
      }),
    ];

    expect(foldRequestHeader(events, 3)).toMatchObject({
      requestId: "request-2",
      headerSeq: 2,
      contextSeq: 3,
      header: unchanged,
    });
    expect(foldRequestHeader(events)).toMatchObject({
      requestId: "request-3",
      header: { selectedModelId: "new-model", maxOutputTokens: 32_768 },
      context: { providerModelId: "provider/new-model", maxOutputTokens: 32_768 },
    });
  });

  it("reports the first semantic mismatch while ignoring object key insertion order", () => {
    const expected = foldRequestHeader([requestEvent(0, "request-1", header())]);
    const reordered = {
      ...expected,
      header: {
        ...expected.header,
        providerOptions: { nested: { zeta: 2, alpha: 1 }, beta: true },
      },
    };
    expect(compareEffectiveRequests(expected, reordered)).toEqual({ equal: true });

    const wrongLimit = {
      ...reordered,
      header: { ...reordered.header, maxOutputTokens: 4_096 },
    };
    expect(compareEffectiveRequests(expected, wrongLimit)).toEqual({
      equal: false,
      path: "$.header.maxOutputTokens",
      expected: 16_384,
      actual: 4_096,
      reason: "value",
    });

    const withContext = foldRequestHeader([
      requestEvent(0, "request-1", header()),
      contextEvent(1, "request-1"),
    ]);
    expect(
      compareEffectiveRequests(withContext, {
        ...withContext,
        context: { ...withContext.context!, maxOutputTokens: 4_096 },
      }),
    ).toEqual({
      equal: false,
      path: "$.context.maxOutputTokens",
      expected: 16_384,
      actual: 4_096,
      reason: "value",
    });
  });

  it("fails clearly when no request header exists before the boundary", () => {
    expect(() => foldRequestHeader([contextEvent(0, "request-1")])).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST", path: "events" }),
    );
    expect(() => foldRequestHeader([requestEvent(2, "request-1", header())], 1)).toThrowError(
      expect.objectContaining({ code: "INVALID_REQUEST", path: "events" }),
    );
  });

  it("serializes every semantic control canonically and rejects secret-bearing descriptors", () => {
    const request = foldRequestHeader([requestEvent(0, "request-1", header())]);
    const serialized = serializeEffectiveRequest(request);

    expect(JSON.parse(serialized)).toMatchObject({
      header: {
        selectedModelId: "selected-model",
        providerRoute: "openrouter",
        providerModelId: "provider/model",
        reasoningEffort: "high",
        maxOutputTokens: 16_384,
        temperature: 0.2,
        topP: 0.9,
        topK: 40,
        seed: 42,
        activeTools: ["calculator"],
        maxSteps: 8,
        chunkTimeoutMs: 30_000,
        totalTimeoutMs: 120_000,
      },
    });

    expect(() =>
      serializeEffectiveRequest({
        ...request,
        header: {
          ...request.header,
          providerOptions: { apiKey: "must-not-persist" },
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "SECRET_IN_REQUEST", path: "$.header.providerOptions.apiKey" }));
    expect(() => compareEffectiveRequests(request, { ...request, toolApprovalSecret: "secret" })).toThrowError(
      expect.objectContaining({ code: "SECRET_IN_REQUEST", path: "$.toolApprovalSecret" }),
    );
  });
});

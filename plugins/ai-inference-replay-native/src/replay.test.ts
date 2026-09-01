import type { AiInferenceStreamRequest } from "@termco/ai-inference-base";
import { SESSION_FORMAT_VERSION } from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import { createReplayInferenceAdapter } from "./replay";

const time = 1_777_777_777_777;

function scenarioJsonl(options: {
  readonly id?: string;
  readonly systemPrompt?: string;
  readonly chunks?: readonly Record<string, unknown>[];
  readonly finishReason?: string;
} = {}): string {
  const id = options.id ?? "scenario-simple";
  const systemPrompt = options.systemPrompt ?? "Answer exactly.";
  const chunks = options.chunks ?? [
    { kind: "text-delta", id: "text-1", delta: "Hello" },
    { kind: "text-delta", id: "text-1", delta: " world" },
  ];
  const records: unknown[] = [
    {
      formatVersion: SESSION_FORMAT_VERSION,
      id,
      createdAt: time,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    },
    { type: "turn/start", seq: 0, time, data: { turn: 1, cause: "user" } },
    { type: "step/start", seq: 1, time: time + 1, data: { turn: 1, step: 1 } },
    {
      type: "request/header",
      seq: 2,
      time: time + 2,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-1",
        reason: "initial",
        header: {
          selectedModelId: "test-model",
          providerRoute: "replay",
          providerModelId: "provider/test-model",
          reasoningEffort: "high",
          providerOptions: { deterministic: true },
          systemPrompt,
          messages: [{ role: "user", content: "Hello" }],
          tools: [],
          activeTools: [],
          maxSteps: 4,
          chunkTimeoutMs: 30_000,
          approvalPolicy: { mode: "ask" },
        },
      },
    },
    { type: "request/attempt", seq: 3, time: time + 3, data: { requestId: "request-1", attempt: 1 } },
    ...chunks.map((chunk, index) => ({
      type: "assistant/chunk",
      seq: index + 4,
      time: time + index + 4,
      data: { turn: 1, step: 1, requestId: "request-1", chunk },
    })),
    {
      type: "assistant/message",
      seq: chunks.length + 4,
      time: time + chunks.length + 4,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-1",
        message: { id: "message-1", role: "assistant", content: "Hello world" },
        usage: { inputTokens: 8, outputTokens: 2 },
        performance: { requestStartedAt: time, endedAt: time + 10 },
        finishReason: options.finishReason ?? "stop",
      },
      surfaceOp: { op: "append" },
    },
    {
      type: "step/end",
      seq: chunks.length + 5,
      time: time + chunks.length + 5,
      data: { turn: 1, step: 1, reason: "completed" },
    },
    {
      type: "turn/end",
      seq: chunks.length + 6,
      time: time + chunks.length + 6,
      data: { turn: 1, reason: { kind: "completed" } },
    },
  ];
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function twoRequestScenarioJsonl(): string {
  const records = scenarioJsonl().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const header = records[0]!;
  const firstEvents = records.slice(1, -1);
  const firstRequest = firstEvents.find((event) => event.type === "request/header")!;
  const firstData = firstRequest.data as Record<string, unknown>;
  const secondHeader = {
    ...(firstData.header as Record<string, unknown>),
    systemPrompt: "Continue exactly.",
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hello world" },
      { role: "user", content: "Continue" },
    ],
  };
  const append = (type: string, data: unknown, extra: Record<string, unknown> = {}) => ({
    type,
    seq: firstEvents.length,
    time: time + firstEvents.length,
    data,
    ...extra,
  });
  const second: Record<string, unknown>[] = [];
  const add = (type: string, data: unknown, extra: Record<string, unknown> = {}) => {
    const event = append(type, data, extra);
    event.seq = firstEvents.length + second.length;
    event.time = time + firstEvents.length + second.length;
    second.push(event);
  };
  add("step/start", { turn: 1, step: 2 });
  add("request/header", {
    turn: 1,
    step: 2,
    requestId: "request-2",
    reason: "step",
    header: secondHeader,
  });
  add("request/attempt", { requestId: "request-2", attempt: 1 });
  add("assistant/chunk", {
    turn: 1,
    step: 2,
    requestId: "request-2",
    chunk: { kind: "text-delta", id: "text-2", delta: "Done" },
  });
  add("assistant/message", {
    turn: 1,
    step: 2,
    requestId: "request-2",
    message: { id: "message-2", role: "assistant", content: "Done" },
    finishReason: "stop",
  }, { surfaceOp: { op: "append" } });
  add("step/end", { turn: 1, step: 2, reason: "completed" });
  add("turn/end", { turn: 1, reason: { kind: "completed" } });
  return [header, ...firstEvents, ...second].map((record) => JSON.stringify(record)).join("\n");
}

function toolScenarioJsonl(): string {
  const schema = {
    type: "object",
    properties: { expression: { type: "string" } },
    required: ["expression"],
  };
  const records: unknown[] = [
    {
      formatVersion: SESSION_FORMAT_VERSION,
      id: "scenario-tool",
      createdAt: time,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
    },
    { type: "turn/start", seq: 0, time, data: { turn: 1, cause: "user" } },
    { type: "step/start", seq: 1, time: time + 1, data: { turn: 1, step: 1 } },
    {
      type: "request/header",
      seq: 2,
      time: time + 2,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-tool",
        reason: "initial",
        header: {
          selectedModelId: "test-model",
          providerRoute: "replay",
          providerModelId: "provider/test-model",
          systemPrompt: "Answer exactly.",
          messages: [{ role: "user", content: "Hello" }],
          tools: [{
            name: "calculator",
            description: "Evaluate an expression",
            schema,
            contributor: { pluginId: "calculator-native", contributionId: "calculator" },
          }],
          activeTools: ["calculator"],
          maxSteps: 4,
          approvalPolicy: { mode: "ask" },
        },
      },
    },
    { type: "request/attempt", seq: 3, time: time + 3, data: { requestId: "request-tool", attempt: 1 } },
    {
      type: "tool/call",
      seq: 4,
      time: time + 4,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-tool",
        callId: "call-calculator",
        name: "calculator",
        rawArguments: "{\"expression\":\"2+2\"}",
        parsedInput: { expression: "2+2" },
        contributor: { pluginId: "calculator-native", contributionId: "calculator" },
        concurrency: "safe",
      },
    },
    {
      type: "tool/result",
      seq: 5,
      time: time + 5,
      data: {
        turn: 1,
        step: 1,
        callId: "call-calculator",
        canonicalOutput: { value: 4 },
        modelContent: { role: "tool", content: { value: 4 } },
      },
      surfaceOp: { op: "append" },
    },
    {
      type: "assistant/message",
      seq: 6,
      time: time + 6,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-tool",
        message: { id: "message-tool", role: "assistant", content: "4" },
        finishReason: "tool-calls",
      },
      surfaceOp: { op: "append" },
    },
    { type: "step/end", seq: 7, time: time + 7, data: { turn: 1, step: 1, reason: "completed" } },
    { type: "turn/end", seq: 8, time: time + 8, data: { turn: 1, reason: { kind: "completed" } } },
  ];
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function auxiliaryScenarioJsonl(): string {
  const [header, ...events] = scenarioJsonl().split("\n").map((line) => JSON.parse(line));
  events.push({
    type: "adapter/event",
    seq: events.length,
    time: time + events.length,
    data: {
      adapter: "ai-inference-replay-native",
      kind: "auxiliary/generate",
      payload: {
        request: {
          kind: "ai.inference.generate",
          modelId: "title-model",
          instructions: "Write a short title.",
          prompt: "Hello world",
          tools: [],
          maxSteps: 1,
          maxOutputTokens: 32,
          temperature: 0,
          providerOptions: { deterministic: true },
          chunkTimeoutMs: 1_000,
          totalTimeoutMs: 2_000,
        },
        result: { text: "Greeting", stepCount: 1, durationMs: 7 },
      },
    },
  });
  return [header, ...events].map((record) => JSON.stringify(record)).join("\n");
}

function lineageFixtures(): readonly { scenarioId: string; sessionJsonl: string }[] {
  const parent = scenarioJsonl({ id: "parent-session" }).split("\n").map((line) => JSON.parse(line));
  const parentRequest = parent.find((event) => event.type === "request/header");
  parentRequest.data.header.selectedModelId = "parent-model";
  parentRequest.data.header.providerModelId = "provider/parent-model";
  const parentEvents = parent.slice(1);
  for (const childSessionId of ["child-a", "child-b"]) {
    parentEvents.push({
      type: "subagent/start",
      seq: parentEvents.length,
      time: time + parentEvents.length,
      data: { childSessionId, request: { role: "research", task: "inspect" } },
    });
    parentEvents.push({
      type: "subagent/end",
      seq: parentEvents.length,
      time: time + parentEvents.length,
      data: { childSessionId, outcome: "completed" },
    });
  }
  const child = (id: string, text: string, boundarySeq: number) => {
    const records = scenarioJsonl({ id }).split("\n").map((line) => JSON.parse(line));
    records[0].parent = { sessionId: "parent-session", boundarySeq, seedLength: 0 };
    records[0].origin = "subagent";
    for (const event of records.filter((record) => record.type === "assistant/chunk")) {
      event.data.chunk.delta = text;
    }
    const message = records.find((record) => record.type === "assistant/message");
    message.data.message.content = `${text}${text}`;
    return records.map((record) => JSON.stringify(record)).join("\n");
  };
  return [
    {
      scenarioId: "parent",
      sessionJsonl: [parent[0], ...parentEvents].map((record) => JSON.stringify(record)).join("\n"),
    },
    { scenarioId: "child-a", sessionJsonl: child("child-a", "A", 7) },
    { scenarioId: "child-b", sessionJsonl: child("child-b", "B", 9) },
  ];
}

function request(overrides: Partial<AiInferenceStreamRequest> = {}): AiInferenceStreamRequest {
  return {
    modelId: "test-model",
    instructions: "Answer exactly.",
    messages: [{ role: "user", content: "Hello" }],
    tools: {},
    activeTools: [],
    reasoningEffort: "high",
    providerOptions: { deterministic: true },
    maxSteps: 4,
    chunkTimeoutMs: 30_000,
    ...overrides,
  };
}

async function collect(stream: unknown): Promise<unknown[]> {
  const reader = (stream as ReadableStream<unknown>).getReader();
  const values: unknown[] = [];
  for (;;) {
    const next = await reader.read();
    if (next.done) return values;
    values.push(next.value);
  }
}

describe("deterministic replay inference adapter", () => {
  it("derives and fully consumes a semantically guarded stream from a canonical session", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "simple", sessionJsonl: scenarioJsonl() },
    ]);

    const result = await replay.stream(request());

    await expect(collect(result.stream)).resolves.toEqual([
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", text: "Hello" },
      { type: "text-delta", id: "text-1", text: " world" },
      { type: "text-end", id: "text-1" },
      {
        type: "finish-step",
        finishReason: "stop",
        usage: { inputTokens: 8, outputTokens: 2 },
      },
      { type: "finish", finishReason: "stop" },
    ]);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("fails at the exact first semantic request difference", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "guarded", sessionJsonl: scenarioJsonl() },
    ]);

    await expect(replay.stream(request({ maxSteps: 5 }))).rejects.toMatchObject({
      code: "REQUEST_MISMATCH",
      path: "$.maxSteps",
    });
    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNBOUND_SCRIPT" }),
    );
  });

  it("distinguishes a bound but unread request from a fully consumed stream", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "unread", sessionJsonl: scenarioJsonl() },
    ]);

    const result = await replay.stream(request());
    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNCONSUMED_REQUEST" }),
    );

    await collect(result.stream);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("rejects an extra live call after the recorded request is consumed", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "single-call", sessionJsonl: scenarioJsonl() },
    ]);
    await collect((await replay.stream(request())).stream);

    await expect(replay.stream(request())).rejects.toMatchObject({ code: "EXTRA_REQUEST" });
  });

  it("keeps every derived request in session order and reports a missing live call", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "two-calls", sessionJsonl: twoRequestScenarioJsonl() },
    ]);

    await collect((await replay.stream(request())).stream);
    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNCONSUMED_REQUEST" }),
    );
    await collect((await replay.stream(request({
      instructions: "Continue exactly.",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello world" },
        { role: "user", content: "Continue" },
      ],
    }))).stream);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("fails immediately when a scenario has no current canonical fixture", () => {
    expect(() => createReplayInferenceAdapter([
      { scenarioId: "missing", sessionJsonl: "" },
    ])).toThrowError(expect.objectContaining({ code: "MISSING_FIXTURE" }));
  });

  it("rejects a normal recorded stream without its canonical terminal finish", () => {
    const [header, ...events] = scenarioJsonl().split("\n").map((line) => JSON.parse(line));
    const withoutTerminal = [
      header,
      ...events
        .filter((event) => event.type !== "assistant/message")
        .map((event, seq) => ({ ...event, seq })),
    ].map((line) => JSON.stringify(line)).join("\n");
    expect(() => createReplayInferenceAdapter([
      { scenarioId: "unterminated", sessionJsonl: withoutTerminal },
    ])).toThrowError(expect.objectContaining({ code: "MISSING_TERMINAL_FINISH" }));
  });

  it("throws the explicit provider failure before returning a first chunk", async () => {
    const replay = createReplayInferenceAdapter([
      {
        scenarioId: "provider-failure",
        sessionJsonl: scenarioJsonl(),
        overrideJson: JSON.stringify({
          calls: [{
            requestId: "request-1",
            action: {
              type: "throw-before-chunk",
              error: { name: "ProviderUnavailable", code: "PROVIDER_UNAVAILABLE", message: "offline" },
            },
          }],
        }),
      },
    ]);

    await expect(replay.stream(request())).rejects.toMatchObject({
      name: "ProviderUnavailable",
      code: "PROVIDER_UNAVAILABLE",
      message: "offline",
    });
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("hangs without output until the live request is cancelled", async () => {
    const ready: string[] = [];
    const controller = new AbortController();
    const replay = createReplayInferenceAdapter([
      {
        scenarioId: "cancelled-hang",
        sessionJsonl: scenarioJsonl(),
        overrideJson: JSON.stringify({
          calls: [{
            index: 0,
            action: { type: "hang-until-cancel", readyMarker: "provider-awaiting-cancel" },
          }],
        }),
      },
    ], { onReady: (marker) => ready.push(marker) });

    const result = await replay.stream(request({ abortSignal: controller.signal }));
    const pending = collect(result.stream);
    await vi.waitFor(() => expect(ready).toEqual(["provider-awaiting-cancel"]));
    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNCONSUMED_REQUEST" }),
    );

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("executes canonical tool calls and verifies their live result", async () => {
    const execute = vi.fn(async () => ({ value: 4 }));
    const replay = createReplayInferenceAdapter([
      { scenarioId: "tool", sessionJsonl: toolScenarioJsonl() },
    ]);
    const tools = {
      calculator: {
        description: "Evaluate an expression",
        inputSchema: {
          type: "object",
          properties: { expression: { type: "string" } },
          required: ["expression"],
        },
        execute,
      },
    };

    const parts = await collect((await replay.stream(request({
      tools,
      activeTools: ["calculator"],
      reasoningEffort: undefined,
      providerOptions: undefined,
      chunkTimeoutMs: undefined,
    }))).stream);

    expect(parts).toEqual(expect.arrayContaining([
      {
        type: "tool-call",
        toolCallId: "call-calculator",
        toolName: "calculator",
        input: { expression: "2+2" },
      },
      {
        type: "tool-result",
        toolCallId: "call-calculator",
        toolName: "calculator",
        output: { value: 4 },
      },
    ]));
    expect(execute).toHaveBeenCalledWith(
      { expression: "2+2" },
      expect.objectContaining({ toolCallId: "call-calculator" }),
    );
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("fails the stream when a live tool result diverges from its canonical result", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "tool-drift", sessionJsonl: toolScenarioJsonl() },
    ]);
    const result = await replay.stream(request({
      tools: {
        calculator: {
          description: "Evaluate an expression",
          inputSchema: {
            type: "object",
            properties: { expression: { type: "string" } },
            required: ["expression"],
          },
          execute: async () => ({ value: 5 }),
        },
      },
      activeTools: ["calculator"],
      reasoningEffort: undefined,
      providerOptions: undefined,
      chunkTimeoutMs: undefined,
    }));

    await expect(collect(result.stream)).rejects.toMatchObject({ code: "TOOL_RESULT_MISMATCH" });
    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNCONSUMED_REQUEST" }),
    );
  });

  it("replays only explicitly marked auxiliary generate requests", async () => {
    const replay = createReplayInferenceAdapter([
      { scenarioId: "auxiliary", sessionJsonl: auxiliaryScenarioJsonl() },
    ]);

    await expect(replay.generate({
      modelId: "title-model",
      instructions: "Write a short title.",
      prompt: "Hello world",
      tools: {},
      maxSteps: 1,
      maxOutputTokens: 32,
      temperature: 0,
      providerOptions: { deterministic: true },
      chunkTimeoutMs: 1_000,
      totalTimeoutMs: 2_000,
    })).resolves.toEqual({ text: "Greeting", stepCount: 1, durationMs: 7 });

    expect(() => replay.assertConsumed()).toThrowError(
      expect.objectContaining({ code: "UNCONSUMED_REQUEST" }),
    );
    await collect((await replay.stream(request())).stream);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("binds explicit generated-id placeholders from the live semantic request", async () => {
    const placeholder = "{{live:/messages/0/id}}";
    const records = scenarioJsonl().split("\n").map((line) => JSON.parse(line));
    const headerEvent = records.find((record) => record.type === "request/header");
    headerEvent.data.header.messages[0].id = placeholder;
    for (const event of records.filter((record) => record.type === "assistant/chunk")) {
      event.data.chunk.id = placeholder;
    }
    const replay = createReplayInferenceAdapter([{
      scenarioId: "generated-id",
      sessionJsonl: records.map((record) => JSON.stringify(record)).join("\n"),
    }]);

    const parts = await collect((await replay.stream(request({
      messages: [{ id: "live-user-id", role: "user", content: "Hello" }],
    }))).stream);

    expect(parts.slice(0, 4)).toEqual([
      { type: "text-start", id: "live-user-id" },
      { type: "text-delta", id: "live-user-id", text: "Hello" },
      { type: "text-delta", id: "live-user-id", text: " world" },
      { type: "text-end", id: "live-user-id" },
    ]);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it.each([
    {
      name: "replace",
      action: {
        type: "replace",
        chunks: [{ kind: "text-delta", id: "replacement", delta: "Replaced" }],
        finishReason: "length",
      },
      expectedText: "Replaced",
      expectedFinish: "length",
    },
    {
      name: "patch",
      action: {
        type: "patch",
        chunks: [{ index: 1, patch: { delta: " replay" } }],
      },
      expectedText: "Hello replay",
      expectedFinish: "stop",
    },
  ])("applies an explicitly targeted $name output override", async ({
    action,
    expectedText,
    expectedFinish,
  }) => {
    const replay = createReplayInferenceAdapter([{
      scenarioId: `override-${action.type}`,
      sessionJsonl: scenarioJsonl(),
      overrideJson: JSON.stringify({
        calls: [{ requestId: "request-1", action }],
      }),
    }]);

    const parts = await collect((await replay.stream(request())).stream) as Record<string, unknown>[];
    expect(parts
      .filter((part) => part.type === "text-delta")
      .map((part) => part.text)
      .join(""))
      .toBe(expectedText);
    expect(parts.at(-1)).toEqual({ type: "finish", finishReason: expectedFinish });
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("binds concurrent semantic twins by durable parent, role, and ordinal", async () => {
    const replay = createReplayInferenceAdapter(lineageFixtures());

    await expect(replay.stream(request())).rejects.toMatchObject({ code: "AMBIGUOUS_SCRIPT" });

    const firstChild = replay.bind({
      kind: "child",
      parentSessionId: "parent-session",
      role: "research",
      ordinal: 0,
    });
    const secondChild = replay.bind({
      kind: "child",
      parentSessionId: "parent-session",
      role: "research",
      ordinal: 1,
    });
    const [first, second] = await Promise.all([
      collect((await firstChild.stream(request())).stream),
      collect((await secondChild.stream(request())).stream),
    ]);
    expect((first as Record<string, unknown>[])
      .filter((part) => part.type === "text-delta")
      .map((part) => part.text)
      .join(""))
      .toBe("AA");
    expect((second as Record<string, unknown>[])
      .filter((part) => part.type === "text-delta")
      .map((part) => part.text)
      .join(""))
      .toBe("BB");

    const parent = replay.bind({ kind: "session", sessionId: "parent-session" });
    await collect((await parent.stream(request({ modelId: "parent-model" }))).stream);
    expect(() => replay.assertConsumed()).not.toThrow();
  });

  it("reports explicit provider discovery metadata from the scenario override", async () => {
    const replay = createReplayInferenceAdapter([{
      scenarioId: "catalog",
      sessionJsonl: scenarioJsonl(),
      overrideJson: JSON.stringify({
        configuration: {
          configuredProviderIds: ["recorded-openrouter"],
          configuredCustomEndpointIds: ["recorded-loopback"],
        },
      }),
    }]);

    await expect(replay.configuration()).resolves.toEqual({
      configuredProviderIds: ["recorded-openrouter"],
      configuredCustomEndpointIds: ["recorded-loopback"],
    });
  });

  it("accepts only the current canonical header-plus-event JSONL representation", () => {
    const records = scenarioJsonl().split("\n").map((line) => JSON.parse(line));
    expect(() => createReplayInferenceAdapter([{
      scenarioId: "unsupported-header",
      sessionJsonl: [
        JSON.stringify({ ...records[0], formatVersion: 1 }),
        ...records.slice(1).map((record) => JSON.stringify(record)),
      ].join("\n"),
    }])).toThrowError(expect.objectContaining({ code: "FORMAT_UNSUPPORTED" }));

    expect(() => createReplayInferenceAdapter([{
      scenarioId: "wrapped-events",
      sessionJsonl: [
        JSON.stringify(records[0]),
        JSON.stringify({ kind: "commit", revision: 1, events: records.slice(1) }),
      ].join("\n"),
    }])).toThrowError(expect.objectContaining({ code: "INVALID_EVENT", path: "event.type" }));
  });
});

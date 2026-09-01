import { SESSION_FORMAT_VERSION } from "@termco/session-base";
import { describe, expect, it } from "vitest";
import {
  sanitizeReplayFixture,
  verifyReplayFixture,
} from "./fixtureWorkflow";

function fixture(
  systemPrompt = "Answer exactly.",
  rootPath = "{{WORKSPACE}}",
): string {
  const time = 1_777_777_777_777;
  return [
    {
      formatVersion: SESSION_FORMAT_VERSION,
      id: "scenario-workflow",
      createdAt: time,
      authority: "v2",
      backend: "chat",
      fidelity: "full",
      workspace: {
        rootHash: "workspace-a",
        rootPath,
      },
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
          systemPrompt,
          messages: [{ role: "user", content: "Hello" }],
          tools: [],
          activeTools: [],
          maxSteps: 4,
          approvalPolicy: { mode: "ask" },
        },
      },
    },
    {
      type: "request/attempt",
      seq: 3,
      time: time + 3,
      data: { requestId: "request-1", attempt: 1 },
    },
    {
      type: "assistant/chunk",
      seq: 4,
      time: time + 4,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-1",
        chunk: { kind: "text-delta", id: "text-1", delta: "Hello" },
      },
    },
    {
      type: "assistant/message",
      seq: 5,
      time: time + 5,
      data: {
        turn: 1,
        step: 1,
        requestId: "request-1",
        message: { id: "message-1", role: "assistant", content: "Hello" },
        finishReason: "stop",
      },
      surfaceOp: { op: "append" },
    },
    {
      type: "step/end",
      seq: 6,
      time: time + 6,
      data: { turn: 1, step: 1, reason: "completed" },
    },
    {
      type: "turn/end",
      seq: 7,
      time: time + 7,
      data: { turn: 1, reason: { kind: "completed" } },
    },
  ].map((record) => JSON.stringify(record)).join("\n");
}

describe("current replay fixture workflow", () => {
  it("sanitizes credentials and absolute private paths with a review report", () => {
    const source = fixture(
      "Use sk-or-v1-super-secret-token at /Users/Kevin/Developer/private-project/file.ts",
      "/Users/Kevin/Developer/private-project",
    );

    const result = sanitizeReplayFixture(source);

    expect(result.sessionJsonl).not.toContain("super-secret-token");
    expect(result.sessionJsonl).not.toContain("/Users/Kevin");
    expect(result.sessionJsonl).toContain("{{CREDENTIAL}}");
    expect(result.sessionJsonl).toContain("{{WORKSPACE}}");
    expect(result.review.replacements.map((entry) => entry.kind))
      .toEqual(expect.arrayContaining(["credential", "absolute-path"]));
    expect(() => verifyReplayFixture(result.sessionJsonl)).not.toThrow();
  });

  it("fails verification for unsanitized secrets and broken semantic sentinels", () => {
    expect(() => verifyReplayFixture(fixture("token sk-live-secret")))
      .toThrow(/credential/i);
    expect(() => verifyReplayFixture(fixture("provider returned UNKNOWN_TOOL")))
      .toThrow(/UNKNOWN_TOOL/);
  });

  it("enforces expected request/model/tool guards without mutating the fixture", () => {
    const sanitized = sanitizeReplayFixture(fixture()).sessionJsonl;
    const before = sanitized;
    const report = verifyReplayFixture(sanitized, {
      expectedRequestCount: 1,
      requiredModelIds: ["test-model"],
      requiredToolNames: [],
    });

    expect(report).toMatchObject({
      sessionId: "scenario-workflow",
      requestCount: 1,
      modelIds: ["test-model"],
      toolNames: [],
    });
    expect(sanitized).toBe(before);
    expect(() => verifyReplayFixture(sanitized, { expectedRequestCount: 2 }))
      .toThrow(/request count/i);
  });
});

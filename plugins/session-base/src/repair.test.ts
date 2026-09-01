import { describe, expect, it } from "vitest";
import { planSessionTailRepair } from "./repair";
import { parseSessionEvent } from "./validation";

describe("current interrupted-session repair", () => {
  it("closes an approval whose UI owner disappeared before a decision", () => {
    const time = 100;
    const records = [
      { type: "turn/start", seq: 0, time, data: { turn: 1, cause: "user" } },
      { type: "step/start", seq: 1, time, data: { turn: 1, step: 1 } },
      {
        type: "request/header",
        seq: 2,
        time,
        data: {
          turn: 1,
          step: 1,
          requestId: "request-1",
          reason: "initial",
          header: {
            selectedModelId: "test-model",
            providerRoute: "replay",
            providerModelId: "test-model",
            systemPrompt: "",
            messages: [],
            tools: [{
              name: "write_file",
              schema: { type: "object" },
              contributor: { pluginId: "files", contributionId: "files" },
            }],
            activeTools: ["write_file"],
            maxSteps: 4,
            approvalPolicy: { mode: "ask" },
          },
        },
      },
      {
        type: "request/attempt",
        seq: 3,
        time,
        data: { requestId: "request-1", attempt: 1 },
      },
      {
        type: "tool/call",
        seq: 4,
        time,
        data: {
          turn: 1,
          step: 1,
          requestId: "request-1",
          callId: "call-1",
          name: "write_file",
          rawArguments: "{}",
          parsedInput: {},
          contributor: { pluginId: "files", contributionId: "files" },
          concurrency: "exclusive",
        },
      },
      {
        type: "approval/request",
        seq: 5,
        time,
        data: {
          approvalId: "approval-1",
          callId: "call-1",
          policy: { mode: "ask" },
          reason: { kind: "tool-policy" },
        },
      },
    ].map((record) => parseSessionEvent(record));

    const repair = planSessionTailRepair(records);

    expect(repair.map((event) => event.type)).toEqual([
      "approval/decision",
      "tool/result",
      "step/end",
      "turn/end",
    ]);
    expect(repair[0]).toMatchObject({
      type: "approval/decision",
      data: {
        approvalId: "approval-1",
        callId: "call-1",
        outcome: "cancelled",
        responder: "policy",
      },
    });
    expect(repair[1]).toMatchObject({
      type: "tool/result",
      data: {
        callId: "call-1",
        error: { code: "OUTCOME_UNKNOWN" },
        recovered: "outcome-unknown",
      },
    });
  });
});

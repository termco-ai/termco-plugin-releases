import { RequestId, StepId, ToolCallId, TurnId } from "@termco/session-base";
import { describe, expect, it } from "vitest";
import { formatDuration, formatNesting, recordKindLabel } from "./recordMeta";

describe("trajectory record presentation", () => {
  it("uses concise operator-facing kind labels", () => {
    expect(recordKindLabel("assistant/response")).toBe("Assistant");
    expect(recordKindLabel("context/injected")).toBe("Context");
    expect(recordKindLabel("company/custom-record")).toBe("company/custom record");
  });

  it("formats durations across millisecond, second, and minute ranges", () => {
    expect(formatDuration({ start: 10, end: 37 })).toBe("27ms");
    expect(formatDuration({ start: 10, end: 2_510 })).toBe("2.50s");
    expect(formatDuration({ start: 10, end: 65_010 })).toBe("1m 05s");
    expect(formatDuration({ start: 10 })).toBe("—");
  });

  it("summarizes structural nesting without leaking long identifiers", () => {
    expect(formatNesting({ turn: TurnId(2), step: StepId(4), requestId: RequestId("request-123456789"), callId: ToolCallId("call-abcdefghi") })).toBe(
      "T2 · S4 · req request-1… · call call-abcd…",
    );
    expect(formatNesting({})).toBe("Session");
  });
});

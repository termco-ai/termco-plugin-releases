import { describe, expect, it } from "vitest";
import { buildErrorMessage } from "./errorMessage";
import { classifyOverflow } from "./overflowError";

describe("provider error recovery", () => {
  it("extracts actionable provider response details", () => {
    expect(buildErrorMessage(new Error("An error occurred"), {
      statusCode: 400,
      responseBody: JSON.stringify({ error: { message: "Invalid prompt" } }),
    })).toBe("HTTP 400: Invalid prompt");
  });

  it("classifies measured and numberless context overflows", () => {
    expect(classifyOverflow(
      new Error("prompt is too long: 120000 tokens > 100000 maximum"),
      { statusCode: 400 },
    )).toEqual({
      provider: "anthropic",
      actual: 120000,
      limit: 100000,
      gap: 20000,
    });
    expect(classifyOverflow("context_length_exceeded")).toEqual({
      provider: "unknown",
    });
  });

  it("never treats a rate limit as a context overflow", () => {
    expect(classifyOverflow("rate limit: too many tokens per minute")).toBeNull();
  });
});

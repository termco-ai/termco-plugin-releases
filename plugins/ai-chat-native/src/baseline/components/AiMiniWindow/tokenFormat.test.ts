import type { UIMessage } from "@ai-sdk/react";
import { describe, expect, it } from "vitest";
import { estimateTokens, formatTokens } from "./tokenFormat";

function msg(parts: unknown[]): UIMessage {
  return { id: "m1", role: "user", parts } as unknown as UIMessage;
}

/**
 * `estimateTokens` is now a thin wrapper over `lib/tokens` — the exact
 * arithmetic (and the image handling this file's old chars/4 estimator got
 * wrong) is covered by `lib/tokens/count.test.ts`. What is worth pinning here
 * is that the meter still behaves sensibly.
 */
describe("estimateTokens", () => {
  it("returns 0 for no messages", () => {
    expect(estimateTokens([])).toBe(0);
  });

  // A message costs something even when empty: the role and delimiters are real
  // tokens the provider bills for.
  it("charges a message frame even with no payload", () => {
    const n = estimateTokens([msg([{ type: "step-start" }])]);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(10);
  });

  it("counts text and reasoning", () => {
    const empty = estimateTokens([msg([{ type: "text", text: "" }])]);
    expect(estimateTokens([msg([{ type: "text", text: "x".repeat(400) }])])).toBeGreaterThan(
      empty + 100,
    );
    expect(
      estimateTokens([msg([{ type: "reasoning", text: "x".repeat(400) }])]),
    ).toBeGreaterThan(empty + 100);
  });

  it("counts tool input and output", () => {
    const bare = estimateTokens([msg([{ type: "tool-read_file" }])]);
    const full = estimateTokens([
      msg([
        {
          type: "tool-read_file",
          input: { path: "/a.ts" },
          output: { type: "text", value: "x".repeat(400) },
        },
      ]),
    ]);
    expect(full).toBeGreaterThan(bare + 100);
  });

  it("tolerates parts with missing text", () => {
    expect(() =>
      estimateTokens([msg([{ type: "text" }, { type: "reasoning" }])]),
    ).not.toThrow();
  });

  it("sums across messages", () => {
    const one = msg([{ type: "text", text: "x".repeat(400) }]);
    expect(estimateTokens([one, one])).toBeGreaterThan(estimateTokens([one]));
  });

  /**
   * The regression that motivated the rewrite: the old estimator skipped image
   * parts entirely, so a chat carrying screenshots read as near-empty right up
   * until the provider rejected it.
   */
  it("no longer ignores images", () => {
    const withImage = msg([
      {
        type: "file",
        mediaType: "image/png",
        url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABAAAAAJYCAYAAAA",
      },
    ]);
    expect(estimateTokens([withImage])).toBeGreaterThan(100);
  });
});

describe("formatTokens", () => {
  it("prints small counts verbatim", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("uses one decimal below 10k", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(9999)).toBe("10.0k");
  });

  it("drops decimals from 10k up to 1M", () => {
    expect(formatTokens(10_000)).toBe("10k");
    expect(formatTokens(123_456)).toBe("123k");
    expect(formatTokens(999_999)).toBe("1000k");
  });

  it("uses M with two decimals at 1M and above", () => {
    expect(formatTokens(1_000_000)).toBe("1.00M");
    expect(formatTokens(2_345_678)).toBe("2.35M");
  });
});

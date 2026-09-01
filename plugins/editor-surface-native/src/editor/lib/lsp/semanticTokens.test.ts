import { describe, expect, it } from "vitest";
import { decodeSemanticTokens } from "./semanticTokens";

const LEGEND = {
  tokenTypes: ["namespace", "function", "variable", "parameter"],
  tokenModifiers: ["declaration", "readonly", "static"],
};

describe("decodeSemanticTokens", () => {
  it("decodes relative deltas to absolute positions", () => {
    // line 0: "fn" at col 0 (function, declaration)
    // line 0: "arg" at col 5 (parameter)
    // line 2: "x" at col 2 (variable, readonly)
    const data = [
      0, 0, 2, 1, 0b001,
      0, 5, 3, 3, 0,
      2, 2, 1, 2, 0b010,
    ];
    expect(decodeSemanticTokens(data, LEGEND)).toEqual([
      { line: 0, character: 0, length: 2, type: "function", modifiers: ["declaration"] },
      { line: 0, character: 5, length: 3, type: "parameter", modifiers: [] },
      { line: 2, character: 2, length: 1, type: "variable", modifiers: ["readonly"] },
    ]);
  });

  it("same-line deltas accumulate, new lines reset the column", () => {
    const data = [
      1, 4, 2, 0, 0,
      0, 6, 2, 0, 0,
      1, 1, 2, 0, 0,
    ];
    const tokens = decodeSemanticTokens(data, LEGEND);
    expect(tokens.map((t) => [t.line, t.character])).toEqual([
      [1, 4],
      [1, 10],
      [2, 1],
    ]);
  });

  it("tolerates unknown type indexes and truncated data", () => {
    const tokens = decodeSemanticTokens([0, 0, 1, 99, 0, 0, 1], LEGEND);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].type).toBe("unknown");
  });
});

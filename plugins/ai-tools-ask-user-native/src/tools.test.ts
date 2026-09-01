import { describe, expect, it } from "vitest";
import {
  createAskUserContribution,
  parseAskUserInput,
  parseAskUserOutput,
} from "./tools";

describe("ask_user contribution", () => {
  it("is interactive and enforces one required question", () => {
    const tool = createAskUserContribution().build({}).ask_user;
    const schema = tool.inputSchema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(tool.execute).toBeUndefined();
    expect(schema.required).toEqual(["question"]);
    expect(schema.properties.question).toMatchObject({ type: "string" });
  });

  it("directs the model to resolve discoverable facts and ask one question", () => {
    const tool = createAskUserContribution().build({}).ask_user;
    expect(tool.description).toMatch(/never for facts you can establish/i);
    expect(tool.description).toMatch(/one question per call/i);
  });

  it("owns tolerant streamed-input and strict output normalization", () => {
    expect(parseAskUserInput({
      question: "Where?",
      options: [
        { label: "A", description: "first", recommended: true },
        { description: "not ready" },
      ],
      estimatedRemaining: 2.8,
    })).toEqual({
      question: "Where?",
      context: undefined,
      options: [
        { label: "A", description: "first", recommended: true },
      ],
      allowFreeText: undefined,
      multiSelect: false,
      topic: undefined,
      estimatedRemaining: 2,
    });
    expect(parseAskUserInput(undefined)).toMatchObject({
      question: "",
      options: [],
    });
    expect(parseAskUserOutput({ answer: "A", selected: ["A", 2] })).toEqual({
      answer: "A",
      selected: ["A"],
      freeText: false,
      skipped: false,
      stopped: false,
    });
    expect(parseAskUserOutput({ answer: 7 })).toBeNull();
  });

  it("reads a complete question", () => {
    expect(parseAskUserInput({
      question: "Where?",
      context: "Matters because…",
      options: [
        { label: "A", description: "first", recommended: true },
        { label: "B" },
      ],
      multiSelect: true,
      topic: "The plan",
      estimatedRemaining: 3,
    })).toEqual({
      question: "Where?",
      context: "Matters because…",
      options: [
        { label: "A", description: "first", recommended: true },
        { label: "B", description: undefined, recommended: false },
      ],
      allowFreeText: undefined,
      multiSelect: true,
      topic: "The plan",
      estimatedRemaining: 3,
    });
  });

  it("survives half-streamed input without inventing a question", () => {
    expect(parseAskUserInput(undefined).question).toBe("");
    expect(parseAskUserInput({ question: "   " }).question).toBe("");
    expect(
      parseAskUserInput({ options: [{ description: "x" }, null] }).options,
    ).toEqual([]);
  });

  it("ignores a non-numeric estimate", () => {
    expect(
      parseAskUserInput({ estimatedRemaining: Number.NaN })
        .estimatedRemaining,
    ).toBeUndefined();
  });

  it("publishes its presentation adapter from the same owned contribution", () => {
    const presentation = createAskUserContribution().presentations?.ask_user;
    expect(presentation).toMatchObject({
      renderer: "ask-user",
      interactive: true,
    });
    expect(presentation?.parseInput({ question: "Ready?" })).toMatchObject({
      question: "Ready?",
    });
  });
});

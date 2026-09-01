import { describe, expect, it } from "vitest";
import { diffRequestHeaders } from "./requestDiff";

const base = {
  selectedModelId: "gpt-5.6-sol",
  providerRoute: "openrouter",
  providerModelId: "openai/gpt-5.6-sol",
  reasoningEffort: "medium",
  maxOutputTokens: 8_192,
  systemPrompt: "You are concise.",
  messages: [{ role: "user", content: "hello" }],
  tools: [{ name: "read", inputSchema: { type: "object" } }],
  activeTools: ["read"],
  approvalPolicy: { mode: "ask" },
};

describe("semantic request diff", () => {
  it("reports model, prompt, control, message, and tool changes by meaning", () => {
    const result = diffRequestHeaders(base, {
      ...base,
      selectedModelId: "gpt-5.6-terra",
      reasoningEffort: "high",
      systemPrompt: "You are thorough.",
      messages: [...base.messages, { role: "user", content: "continue" }],
      tools: [
        { name: "read", inputSchema: { type: "object", required: ["path"] } },
        { name: "write", inputSchema: { type: "object" } },
      ],
      activeTools: ["read", "write"],
      approvalPolicy: { mode: "allow-safe" },
    });

    expect(result.fields.map((field) => field.label)).toEqual([
      "Model", "Reasoning", "Instructions", "Messages", "Approval policy",
    ]);
    expect(result.tools).toEqual({ added: ["write"], removed: [], changed: ["read"] });
    expect(result.changed).toBe(true);
  });

  it("is stable for semantically identical object key ordering", () => {
    const result = diffRequestHeaders(base, {
      ...base,
      approvalPolicy: { mode: "ask" },
      tools: [{ inputSchema: { type: "object" }, name: "read" }],
    });

    expect(result).toEqual({ changed: false, fields: [], tools: { added: [], removed: [], changed: [] } });
  });
});

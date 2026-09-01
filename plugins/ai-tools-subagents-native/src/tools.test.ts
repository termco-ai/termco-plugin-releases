import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type {
  AiToolDefinition,
  AiToolRuntime,
  AiToolsetContribution,
} from "@termco/ai-tools-base";
import { describe, expect, it, vi } from "vitest";
import { createSubagentContribution, createSubagentTools } from "./tools";

const toolsets: AiToolsetContribution[] = [{
  id: "read",
  group: "files",
  build: () => ({
    read_file: { inputSchema: { type: "object" }, execute: async () => ({ ok: true }) },
    write_file: { inputSchema: { type: "object" }, execute: async () => ({ ok: true }), needsApproval: true },
    grep: { inputSchema: { type: "object" }, execute: async () => ({ hits: [] }) },
  }),
}];

const stream = vi.fn<AiInferenceCapability["stream"]>(async () => ({
  stream: new ReadableStream(),
}));
const configuration: AiInferenceCapability["configuration"] = async () => ({
  configuredProviderIds: [],
  configuredCustomEndpointIds: [],
});

function runtime(overrides: Partial<AiToolRuntime> = {}): AiToolRuntime {
  return { getSelectedModelId: () => "gpt-test", ...overrides };
}

describe("AI Tools: Subagents", () => {
  it("publishes a replaceable contribution", () => {
    expect(createSubagentContribution({ configuration, generate: vi.fn(), stream }, toolsets)).toMatchObject({
      id: "subagent", group: "agents", order: 185,
    });
  });

  it("orchestrates inference with only the allowed reusable tools", async () => {
    const generate = vi.fn<AiInferenceCapability["generate"]>(async () => ({ text: "found it", stepCount: 2, durationMs: 1500 }));
    const progress = vi.fn();
    const tools = createSubagentTools({
      inference: { configuration, generate, stream } satisfies AiInferenceCapability,
      toolsets,
      runtime: runtime({ reportProgress: progress }),
    });
    await expect((tools.run_subagent as AiToolDefinition).execute({ type: "explore", prompt: "Find the owner" }))
      .resolves.toMatchObject({ summary: "found it", stepCount: 2 });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({
      modelId: "gpt-test",
      tools: { read_file: expect.any(Object), grep: expect.any(Object) },
      maxSteps: 8,
    }));
    expect(generate.mock.calls[0]?.[0].tools).not.toHaveProperty("write_file");
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ done: true }));
  });

  it("returns an explanation when session model access is unavailable", async () => {
    const tools = createSubagentTools({
      inference: { configuration, generate: vi.fn(), stream },
      toolsets,
      runtime: runtime({ getSelectedModelId: () => null }),
    });
    await expect((tools.run_subagent as AiToolDefinition).execute({ type: "general", prompt: "Research" }))
      .resolves.toMatchObject({ error: expect.stringContaining("selected model") });
  });
});

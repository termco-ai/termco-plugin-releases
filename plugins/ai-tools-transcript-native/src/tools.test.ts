import type { AiContextArtifactsCapability } from "@termco/ai-sessions-base";
import { describe, expect, it, vi } from "vitest";
import { createTranscriptContribution } from "./tools";

describe("context recall contribution", () => {
  it("reads both artifact kinds through the shared provider", async () => {
    const artifacts = {
      readTranscript: vi.fn(async () => ({ content: "chat", offset: 1, totalLines: 1, truncated: false })),
      readToolOutput: vi.fn(async () => ({ content: "output", offset: 1, totalLines: 1, truncated: false })),
    } as unknown as AiContextArtifactsCapability;
    const tools = createTranscriptContribution(artifacts).build({});
    await expect(tools.read_transcript.execute?.({ id: "run-1" })).resolves.toMatchObject({ content: "chat" });
    await expect(tools.read_tool_output.execute?.({ id: "out-1" })).resolves.toMatchObject({ content: "output" });
    expect(artifacts.readTranscript).toHaveBeenCalledWith("run-1", { offset: undefined, limit: undefined });
  });

  it("explains missing artifacts instead of fabricating content", async () => {
    const artifacts = {
      readTranscript: async () => null,
      readToolOutput: async () => null,
    } as unknown as AiContextArtifactsCapability;
    const tools = createTranscriptContribution(artifacts).build({});
    await expect(tools.read_transcript.execute?.({ id: "missing" })).resolves.toMatchObject({ error: expect.stringContaining("no transcript") });
    await expect(tools.read_tool_output.execute?.({ id: "missing" })).resolves.toMatchObject({ error: expect.stringContaining("no saved output") });
  });
});

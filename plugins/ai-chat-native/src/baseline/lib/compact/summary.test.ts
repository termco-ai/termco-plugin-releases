import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSummaryPrompt,
  extractSummary,
  flattenForSummary,
  MAX_SUMMARY_BLOCKS,
  renderForSummariser,
  shouldCollapseChain,
  summarizeConversation,
} from "./summary";

const session = vi.hoisted(() => ({ append: vi.fn() }));
vi.mock("../../../runtime", () => ({ appendSessionDiagnostic: session.append }));

const generate = vi.fn<AiInferenceCapability["generate"]>();
const inference: AiInferenceCapability = {
  configuration: vi.fn(),
  generate,
  stream: vi.fn(),
};

function head(extra = ""): ModelMessage[] {
  return Array.from({ length: 8 }, (_, index) => ({
    role: "user" as const,
    content: `message ${index} ${"detail ".repeat(400)} ${extra}`,
  }));
}

beforeEach(() => {
  session.append.mockReset();
  generate.mockReset();
  generate.mockResolvedValue({
    text: "<analysis>notes</analysis><summary> useful summary </summary>",
    stepCount: 1,
    durationMs: 1,
  });
});

describe("summary inference", () => {
  it("uses the public inference provider and keeps only the summary block", async () => {
    await expect(
      summarizeConversation({
        inference,
        modelId: "model-a",
        contextLimit: 128_000,
        head: head(),
        tailPreserved: true,
      }),
    ).resolves.toBe("useful summary");
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "model-a",
        maxSteps: 1,
      }),
    );
    expect(generate.mock.calls[0][0]).not.toHaveProperty("tools");
    expect(generate.mock.calls[0][0].instructions).toMatch(
      /Do NOT propose a next step/,
    );
  });

  it("records the exact summary request and response in session history", async () => {
    await summarizeConversation({
      inference,
      modelId: "model-a",
      contextLimit: 128_000,
      head: head(),
      sessionId: "session-1",
    });
    expect(session.append).toHaveBeenNthCalledWith(
      1,
      "session-1",
      "compaction-request",
      expect.objectContaining({ phase: "request", modelId: "model-a" }),
    );
    expect(session.append).toHaveBeenNthCalledWith(
      2,
      "session-1",
      "compaction-response",
      expect.objectContaining({
        phase: "response",
        summary: "useful summary",
      }),
    );
  });

  it("redacts credentials before the transcript leaves the plugin", async () => {
    await summarizeConversation({
      inference,
      modelId: "model-a",
      contextLimit: 128_000,
      head: head("sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345"),
    });
    expect(generate.mock.calls[0][0].prompt).not.toContain("sk-ant-api03");
    expect(generate.mock.calls[0][0].prompt).toContain("REDACTED");
  });

  it("falls back to the run model when the selected summary model fails", async () => {
    generate
      .mockRejectedValueOnce(new Error("summary model unavailable"))
      .mockResolvedValueOnce({
        text: "<summary>fallback</summary>",
        stepCount: 1,
        durationMs: 1,
      });
    await expect(
      summarizeConversation({
        inference,
        modelId: "cheap-model",
        fallbackModelId: "run-model",
        contextLimit: 32_000,
        head: head(),
      }),
    ).resolves.toBe("fallback");
    expect(generate.mock.calls.map(([request]) => request.modelId)).toEqual([
      "cheap-model",
      "run-model",
    ]);
  });
});

describe("summary fidelity", () => {
  it("renders text and tool activity without serializing media payloads", () => {
    const transcript = flattenForSummary([
      { role: "user", content: "fix it" },
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolName: "read_file", input: { path: "a.ts" } },
          { type: "image", image: "base64-secret" },
        ] as never,
      },
    ]);
    expect(transcript).toContain("calls read_file");
    expect(transcript).toContain("[image]");
    expect(transcript).not.toContain("base64-secret");
  });

  it("clips the middle when even cold tool rendering exceeds the model budget", () => {
    const history: ModelMessage[] = Array.from({ length: 40 }, (_, index) => ({
      role: "tool" as const,
      content: [
        {
          type: "tool-result",
          toolName: "read_file",
          output: `${index} ${"x".repeat(4_000)}`,
        },
      ] as never,
    }));
    const rendered = renderForSummariser(history, 200);
    expect(rendered.level).toBe("clipped");
    expect(rendered.transcript).toContain("tokens truncated");
  });

  it("collapses a summary chain at its established ceiling", () => {
    const chain = {
      blocks: Array.from({ length: MAX_SUMMARY_BLOCKS }, () => "summary"),
      transcriptIds: [],
    };
    expect(shouldCollapseChain(chain, 128_000)).toBe(true);
  });

  it("keeps safety rules in every prompt shape", () => {
    for (const scope of ["full", "recent"] as const) {
      for (const tailPreserved of [false, true]) {
        const prompt = buildSummaryPrompt({ scope, tailPreserved });
        expect(prompt).toContain("security-relevant");
        expect(prompt).toContain("Never attribute it to the user");
        expect(prompt).toContain("<analysis>");
        expect(prompt).toContain("<summary>");
      }
    }
  });

  it("drops analysis scratch space from tagged and truncated replies", () => {
    expect(
      extractSummary(
        "<analysis>private notes</analysis><summary>public result</summary>",
      ),
    ).toBe("public result");
    expect(extractSummary("<analysis>unfinished notes")).toBeNull();
  });
});

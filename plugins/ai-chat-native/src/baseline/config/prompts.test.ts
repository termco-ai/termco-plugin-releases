import type { PreferencesCapability } from "@termco/storage-base";
import type { SessionHistoryCapability } from "@termco/session-base";
import { beforeEach, describe, expect, it } from "vitest";
import { configureSessionRuntime } from "../../runtime";
import {
  buildStableSystemPrompt,
  buildProviderPrompt,
  PLAN_MODE_PROMPT,
  selectSystemPrompt,
  SYSTEM_PROMPT,
  SYSTEM_PROMPT_LITE,
} from "./prompts";

beforeEach(() => {
  configureSessionRuntime({
    preferences: {} as PreferencesCapability,
    history: {} as SessionHistoryCapability,
    models: [
      {
        id: "openai",
        label: "OpenAI",
        keyringAccount: "openai-api-key",
        keyPrefix: "sk-",
        consoleUrl: "https://example.invalid",
        keyRequirement: "required",
        kind: "cloud",
        description: "Models",
        models: [
          {
            id: "company-fast",
            provider: "openai",
            label: "Company Fast",
            hint: "Fast",
            description: "Replacement small model",
            capabilities: { intelligence: 3, speed: 5, cost: 5 },
          },
        ],
      },
    ],
  });

});

describe("chat-owned system prompt", () => {
  it("preserves the established full and lite prompt anchors", () => {
    expect(SYSTEM_PROMPT).toContain("You are Termco");
    expect(SYSTEM_PROMPT).toContain("<env>");
    expect(SYSTEM_PROMPT).toContain("Refused reads on sensitive files");
    expect(SYSTEM_PROMPT_LITE).toContain("You are Termco");
    expect(SYSTEM_PROMPT_LITE).toContain("<env>");
  });

  it("uses capability metadata from a replacement models provider", () => {
    expect(selectSystemPrompt("company-fast")).toBe(SYSTEM_PROMPT_LITE);
    expect(selectSystemPrompt("unknown-company-model")).toBe(SYSTEM_PROMPT);
  });

  it("restores persona, custom instructions, terse mode, summary, and skill menu", () => {
    const prompt = buildStableSystemPrompt({
      modelId: "company-fast",
      agent: {
        id: "company-agent",
        name: "Company Agent",
        description: "Uses company rules",
        instructions: "Follow the company architecture.",
        icon: "spark",
        builtIn: false,
      },
      customInstructions: "Prefer integration tests.",
      projectMemory: "Use the repository's public capability seams.",
      terse: true,
      summaryBlocks: ["Earlier work changed the API."],
      transcriptIds: ["chat-before-compaction"],
      skills: [
        {
          id: "review",
          name: "Review",
          description: "Review code",
          body: "Review carefully.",
          source: { origin: "global" },
        },
      ],
    });

    expect(prompt).toContain("TERSE MODE");
    expect(prompt).toContain("ACTIVE AGENT — Company Agent");
    expect(prompt).toContain("Follow the company architecture.");
    expect(prompt).toContain("Prefer integration tests.");
    expect(prompt).toContain("PROJECT CONTEXT");
    expect(prompt).toContain("public capability seams");
    expect(prompt).toContain("PRIOR CONVERSATION SUMMARY");
    expect(prompt).toContain("PRIOR CONVERSATION TRANSCRIPTS");
    expect(prompt).toContain("`chat-before-compaction`");
    expect(prompt).toContain("- Review — Review code");
  });

  it("restores plan-mode instructions and Anthropic prompt-cache boundaries", () => {
    expect(PLAN_MODE_PROMPT).toContain("PLAN MODE");
    expect(PLAN_MODE_PROMPT).toContain("bash_run");
    const prompt = buildProviderPrompt({
      provider: "anthropic",
      stable: "stable",
      planMode: true,
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "reply" },
      ],
    });
    expect(Array.isArray(prompt.instructions)).toBe(true);
    expect((prompt.instructions as Array<{ content: string }>).map((part) => part.content))
      .toEqual(["stable", PLAN_MODE_PROMPT]);
    expect(prompt.messages.at(-1)?.providerOptions).toMatchObject({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });
});

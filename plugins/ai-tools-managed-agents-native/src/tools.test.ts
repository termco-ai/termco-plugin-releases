import type { AiToolRuntime } from "@termco/ai-tools-base";
import { describe, expect, it, vi } from "vitest";
import {
  createManagedAgentContribution,
  createManagedAgentTools,
  hasControlCharacters,
  tailLines,
} from "./tools";

function runtime(overrides: Partial<AiToolRuntime> = {}): AiToolRuntime {
  return {
    getManagedCodingAgent: () => null,
    spawnManagedCodingAgent: () => ({ tabId: 3, leafId: 4 }),
    sendManagedCodingAgentInstruction: async () => ({ ok: true, round: 2 }),
    readManagedCodingAgentOutput: () => "one\ntwo\nthree",
    ...overrides,
  };
}

describe("AI Tools: Managed Coding Agents", () => {
  it("publishes an independently replaceable managed-agent contribution", () => {
    expect(createManagedAgentContribution()).toMatchObject({
      id: "managed-agent",
      group: "agents",
      order: 180,
    });
  });

  it("spawns through the session runtime and rejects a duplicate", async () => {
    const spawn = vi.fn(() => ({ tabId: 8, leafId: 9 }));
    const tools = createManagedAgentTools(runtime({ spawnManagedCodingAgent: spawn }));
    expect(await tools.spawn_coding_agent.execute({ prompt: "do it" }))
      .toMatchObject({ ok: true, tab_id: 8 });
    expect(spawn).toHaveBeenCalledWith("do it");
    const duplicate = createManagedAgentTools(runtime({
      getManagedCodingAgent: () => ({
        leafId: 1, tabId: 2, phase: "working", rounds: 1, maxRounds: 3,
      }),
    }));
    expect(await duplicate.spawn_coding_agent.execute({ prompt: "again" }))
      .toMatchObject({ error: expect.stringContaining("already active") });
  });

  it("normalizes safe follow-ups and rejects control characters", async () => {
    const send = vi.fn(async () => ({ ok: true, round: 2 }));
    const active = () => ({
      leafId: 1, tabId: 2, phase: "working" as const, rounds: 1, maxRounds: 3,
    });
    const tools = createManagedAgentTools(runtime({
      getManagedCodingAgent: active,
      sendManagedCodingAgentInstruction: send,
    }));
    expect(await tools.send_to_agent.execute({ instruction: "fix\n this" }))
      .toMatchObject({ ok: true, sent: "fix this", round: 2 });
    expect(send).toHaveBeenCalledWith("fix this");
    expect(hasControlCharacters("bad\u0000input")).toBe(true);
    expect(await tools.send_to_agent.execute({ instruction: "bad\u0000input" }))
      .toMatchObject({ error: expect.stringContaining("control") });
  });

  it("returns bounded output with shared status", async () => {
    const tools = createManagedAgentTools(runtime({
      getManagedCodingAgent: () => ({
        leafId: 1, tabId: 2, phase: "reviewing", rounds: 2, maxRounds: 3,
      }),
    }));
    expect(await tools.read_agent_output.execute({ lines: 2 })).toEqual({
      active: true,
      phase: "reviewing",
      rounds: 2,
      max_rounds: 3,
      output: "two\nthree",
    });
    expect(tailLines("a\nb\nc", 2)).toBe("b\nc");
  });
});

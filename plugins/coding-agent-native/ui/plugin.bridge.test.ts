import {
  bindProcessTransport,
  type CapabilityTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererCodingAgents } from "./plugin";

describe("coding-session renderer bridge", () => {
  it("preserves results, authenticated caller intent, cancellation, and errors", async () => {
    const call = vi.fn(async ({ method, args }) => {
      if (args[0] === "agent_run_abort") return { ok: true };
      if (args[0] === "agent_run_resubscribe") {
        throw new Error("resubscribe failed");
      }
      return method;
    }) as CapabilityTransport;
    const agents = createRendererCodingAgents(
      bindProcessTransport("coding-agent-native", call),
    );

    await expect(
      agents.invoke("agent_run_abort", { runId: "run-1" }),
    ).resolves.toEqual({ ok: true });
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "agents.coding-sessions",
        method: "invoke",
        caller: true,
      }),
    );
    await expect(
      agents.invoke("agent_run_resubscribe", { runId: "run-1" }),
    ).rejects.toThrow("resubscribe failed");
  });
});

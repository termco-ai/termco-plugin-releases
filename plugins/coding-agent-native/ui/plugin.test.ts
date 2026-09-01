import { describe, expect, it, vi } from "vitest";
import type { CodingAgentsUiCapability } from "@termco/agents-base";
import { installCodingAgentsE2E } from "./plugin";

describe("coding agents E2E seam", () => {
  it("delegates live-run control and run seeding to the public UI capability", async () => {
    type SeedRunInput = { runId: string; rigId: string; title: string };
    const debugSeedRun = vi.fn();
    const start = vi.fn(async () => "run-live");
    const snapshot = vi.fn(() => ({
      status: "running" as const,
      pendingApprovalId: null,
      toolNames: ["browser_navigate"],
      error: null,
      text: "SHEEP_MARKER",
    }));
    const respondApproval = vi.fn();
    const host = { __termco: { e2e: true }, __termcoE2E: {} };
    const dispose = installCodingAgentsE2E(
      host,
      {
        debugSeedRun,
        start,
        snapshot,
        respondApproval,
      } as unknown as CodingAgentsUiCapability,
    );
    const input: SeedRunInput = {
      runId: "run-a",
      rigId: "rig-a",
      title: "Run A",
    };
    const seam = host.__termcoE2E as {
      debugSeedRun(input: SeedRunInput): void;
      codingAgentsStart: CodingAgentsUiCapability["start"];
      codingAgentsSnapshot: CodingAgentsUiCapability["snapshot"];
      codingAgentsRespondApproval: CodingAgentsUiCapability["respondApproval"];
    };
    seam.debugSeedRun(input);
    expect(debugSeedRun).toHaveBeenCalledWith(input);
    await expect(seam.codingAgentsStart({
      backend: "claude",
      prompt: "Open the browser",
      cwd: "/repo",
    })).resolves.toBe("run-live");
    expect(start).toHaveBeenCalledWith({
      backend: "claude",
      prompt: "Open the browser",
      cwd: "/repo",
    });
    expect(seam.codingAgentsSnapshot("run-live")?.text).toBe("SHEEP_MARKER");
    seam.codingAgentsRespondApproval("run-live", "approval-1", true);
    expect(respondApproval).toHaveBeenCalledWith("run-live", "approval-1", true);
    dispose();
    expect(host.__termcoE2E).toEqual({});
  });
});

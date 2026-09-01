import { describe, expect, it, vi } from "vitest";
import { installMcpToolBridgeE2E } from "./renderer";

describe("MCP tool bridge E2E seam", () => {
  it("seeds the selected bridge store and removes only its own hook", () => {
    const addApproval = vi.fn();
    const host = { __termco: { e2e: true }, __termcoE2E: { kept: true } };
    const dispose = installMcpToolBridgeE2E(host, addApproval);
    const payload = { requestId: "approval-1" };

    (host.__termcoE2E as unknown as {
      mcpEmitApproval(request: unknown): void;
    }).mcpEmitApproval(payload);
    expect(addApproval).toHaveBeenCalledWith(payload);

    dispose();
    expect(host.__termcoE2E).toEqual({ kept: true });
  });

  it("is unavailable outside the explicit E2E runtime", () => {
    const host = { __termco: { e2e: false }, __termcoE2E: { kept: true } };
    const dispose = installMcpToolBridgeE2E(host, vi.fn());
    expect(host.__termcoE2E).toEqual({ kept: true });
    dispose();
  });
});

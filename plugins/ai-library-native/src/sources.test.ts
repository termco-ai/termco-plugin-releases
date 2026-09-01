import { describe, expect, it, vi } from "vitest";
import { createAiLibrarySources } from "./sources";

describe("AI library source registry", () => {
  it("removes and restores only the MCP source adapter", async () => {
    const sources = createAiLibrarySources();
    const changed = vi.fn();
    sources.registry.subscribe(changed);
    const mcp = {
      connect: vi.fn(async () => ({ ok: true as const, tools: [] })),
      disconnect: vi.fn(),
      clearOAuth: vi.fn(async () => {}),
      status: vi.fn(() => ({ connected: true, tools: [] })),
      call: vi.fn(async () => ({})),
      disconnectAll: vi.fn(),
      liveResources: vi.fn(() => []),
    };
    const dispose = sources.registry.register({
      id: "mcp",
      kind: "mcp",
      capability: mcp,
    });

    await sources.mcp.connect({ name: "docs", command: "docs" });
    expect(mcp.connect).toHaveBeenCalledTimes(1);
    dispose();

    await expect(
      sources.mcp.connect({ name: "docs", command: "docs" }),
    ).resolves.toMatchObject({ error: expect.stringContaining("unavailable") });
    expect(sources.registry.snapshot()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("returns an empty discovery result while the file source is absent", async () => {
    const sources = createAiLibrarySources();
    await expect(
      sources.discover("/repo", { kind: "local" }, false),
    ).resolves.toEqual({
      root: "/repo",
      scopeKey: "local",
      artifacts: [],
      counts: {
        memory: 0,
        skill: 0,
        agent: 0,
        command: 0,
        mcp: 0,
        rules: 0,
        settings: 0,
      },
    });
  });
});

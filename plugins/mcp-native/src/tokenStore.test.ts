import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { SecretsCapability } from "@termco/storage-base";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secretGet: vi.fn(),
  secretSet: vi.fn(async () => {}),
  secretDelete: vi.fn(async () => {}),
}));

import { configureMcpRuntime } from "./runtime";
import { clearTokens, loadTokens, saveTokens } from "./tokenStore";

const tokens = {
  accessToken: "at",
  refreshToken: "rt",
  clientId: "cid",
  tokenEndpoint: "https://as/token",
  authorizationEndpoint: "https://as/authorize",
};

beforeEach(() => {
  vi.clearAllMocks();
  configureMcpRuntime({
    secrets: {
      get: mocks.secretGet,
      set: mocks.secretSet,
      delete: mocks.secretDelete,
      getAll: vi.fn(),
    } as SecretsCapability,
    events: {} as ApplicationEventsCapability,
    desktop: {} as DesktopIntegrationCapability,
  });
});

describe("mcp tokenStore", () => {
  it("saves under the mcp-oauth:<server> account as JSON", async () => {
    await saveTokens("linear", tokens);
    expect(mocks.secretSet).toHaveBeenCalledWith(
      "termco-ai",
      "mcp-oauth:linear",
      JSON.stringify(tokens),
    );
  });

  it("loads and parses stored tokens", async () => {
    mocks.secretGet.mockResolvedValue(JSON.stringify(tokens));
    expect(await loadTokens("linear")).toEqual(tokens);
    expect(mocks.secretGet).toHaveBeenCalledWith("termco-ai", "mcp-oauth:linear");
  });

  it("returns null when absent or corrupt", async () => {
    mocks.secretGet.mockResolvedValue(null);
    expect(await loadTokens("x")).toBeNull();
    mocks.secretGet.mockResolvedValue("{not json");
    expect(await loadTokens("x")).toBeNull();
  });

  it("clears the stored blob", async () => {
    await clearTokens("linear");
    expect(mocks.secretDelete).toHaveBeenCalledWith(
      "termco-ai",
      "mcp-oauth:linear",
    );
  });
});

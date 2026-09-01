import { AI_TOOLS_SERVICE, type AiToolRegistry } from "@termco/ai-tools-base";
import type { PluginActivationContext } from "@termco/kernel";
import {
  SESSION_MODEL_QUERY_SERVICE,
  type SessionModelQueryCapability,
} from "@termco/session-base";
import { describe, expect, it, vi } from "vitest";
import plugin from "./plugin";

describe("AI session query plugin", () => {
  it("registers only through the separate model query capability", async () => {
    const query = {} as SessionModelQueryCapability;
    const register = vi.fn(() => () => {});
    const registry = { register } as unknown as AiToolRegistry;
    const context = {
      get(key: string) {
        if (key === SESSION_MODEL_QUERY_SERVICE) return query;
        if (key === AI_TOOLS_SERVICE) return registry;
        throw new Error(`unexpected service ${key}`);
      },
      async effect(factory: () => unknown) {
        return factory();
      },
    } as unknown as PluginActivationContext;

    expect(plugin.inject).toEqual([SESSION_MODEL_QUERY_SERVICE, AI_TOOLS_SERVICE]);
    await plugin.activate?.(context);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: "session-query" }));
  });
});

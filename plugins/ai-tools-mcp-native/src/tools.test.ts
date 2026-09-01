import type { McpClientsCapability } from "@termco/mcp-base";
import { describe, expect, it, vi } from "vitest";
import {
  buildMcpTools,
  type McpToolContext,
  type McpToolEntry,
} from "./tools";

const entry = (server: string, name: string): McpToolEntry => ({
  server,
  tool: {
    name,
    description: `${name} tool`,
    inputSchema: { type: "object" },
  },
});
const context = (entries: McpToolEntry[]): McpToolContext => ({
  getMcpTools: () => entries,
});
type Executable = {
  needsApproval: boolean;
  execute(input: unknown): PromiseLike<unknown> | unknown;
};

describe("source-owned MCP AI tools", () => {
  it("namespaces, sanitizes, gates, and disambiguates tools", () => {
    const call = vi.fn();
    const tools = buildMcpTools(
      { call } as Pick<McpClientsCapability, "call">,
      context([entry("a.b", "do.thing"), entry("a b", "do.thing")]),
    );
    expect(Object.keys(tools)).toEqual([
      "mcp__a_b__do_thing",
      "mcp__a_b__do_thing_2",
    ]);
    expect((tools.mcp__a_b__do_thing as Executable).needsApproval).toBe(true);
  });

  it("calls the selected client provider and flattens text content", async () => {
    const call = vi.fn(async () => ({
      content: [
        { type: "text", text: "hello" },
        { type: "text", text: "world" },
      ],
    }));
    const tools = buildMcpTools(
      { call },
      context([entry("files", "read")]),
    );
    await expect(
      (tools.mcp__files__read as Executable).execute({ path: "/x" }),
    ).resolves.toEqual({ content: "hello\nworld" });
    expect(call).toHaveBeenCalledWith("files", "read", { path: "/x" });
  });

  it("preserves provider errors", async () => {
    const tools = buildMcpTools(
      { call: async () => ({ error: "server down" }) },
      context([entry("files", "read")]),
    );
    await expect(
      (tools.mcp__files__read as Executable).execute({}),
    ).resolves.toEqual({ error: "server down" });
  });
});

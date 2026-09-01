import { describe, expect, it } from "vitest";
import { createCodexAdapter } from "./codexAdapter";

const BASE = { runId: "r1", backend: "codex" as const, prompt: "go", cwd: "/repo" };

describe("codex adapter — MCP injection", () => {
  it("wires the termco server with a bearer_token_env_var (token not in argv)", () => {
    const cmd = createCodexAdapter().buildCommand({
      ...BASE,
      mcpUrl: "http://127.0.0.1:45817/mcp",
      mcpToken: "SECRET-TOKEN",
    });
    expect(JSON.stringify(cmd.args)).not.toContain("SECRET-TOKEN");
    // Check the raw argv elements (JSON.stringify escapes the inner quotes).
    expect(cmd.args).toContain('mcp_servers.termco.url="http://127.0.0.1:45817/mcp"');
    expect(cmd.args).toContain('mcp_servers.termco.bearer_token_env_var="TERMCO_MCP_TOKEN"');
    expect(cmd.env?.TERMCO_MCP_TOKEN).toBe("SECRET-TOKEN");
  });

  it("keeps the prompt as the trailing positional after the -c overrides", () => {
    const cmd = createCodexAdapter().buildCommand({
      ...BASE,
      mcpUrl: "http://127.0.0.1:45817/mcp",
      mcpToken: "t",
    });
    expect(cmd.args[cmd.args.length - 1]).toBe("go");
  });

  it("omits MCP wiring when no URL is given", () => {
    const cmd = createCodexAdapter().buildCommand(BASE);
    expect(JSON.stringify(cmd.args)).not.toContain("mcp_servers.termco");
    expect(cmd.env).toBeUndefined();
  });
});
// Owned by the coding-agent-native provider plugin.

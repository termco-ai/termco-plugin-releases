import { describe, expect, it } from "vitest";
import { connectSnippet, registerCommand } from "./onboarding";

const URL = "http://127.0.0.1:45817/mcp";

describe("registerCommand", () => {
  it("claude: http transport, user scope, bearer header carries the token", () => {
    const { bin, args } = registerCommand("claude", URL, "TOK");
    expect(bin).toBe("claude");
    expect(args).toEqual([
      "mcp",
      "add",
      "--transport",
      "http",
      "--scope",
      "user",
      "termco",
      URL,
      "--header",
      "Authorization: Bearer TOK",
    ]);
  });

  it("codex: --url + bearer_token_env_var (token stays out of argv)", () => {
    const { bin, args } = registerCommand("codex", URL, "TOK");
    expect(bin).toBe("codex");
    expect(args).toEqual([
      "mcp",
      "add",
      "termco",
      "--url",
      URL,
      "--bearer-token-env-var",
      "TERMCO_MCP_TOKEN",
    ]);
    // Verified live 2026-08-13: this writes [mcp_servers.termco] to config.toml.
    expect(args).not.toContain("TOK");
  });
});

describe("connectSnippet", () => {
  it("emits an http mcpServers block with the bearer header + an env note", () => {
    const s = connectSnippet(URL, "TOK");
    const json = JSON.parse(s.split("\n\n")[0]);
    expect(json.mcpServers.termco).toEqual({
      type: "http",
      url: URL,
      headers: { Authorization: "Bearer TOK" },
    });
    expect(s).toContain("TERMCO_MCP_TOKEN=TOK");
  });
});
// Owned by the mcp-server-native provider plugin.

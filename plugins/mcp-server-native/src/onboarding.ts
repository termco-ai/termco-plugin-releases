/**
 * Pure builders for connecting an EXTERNAL agent to the app's MCP server:
 * the one-click registration argv per known CLI, and the copy-paste config
 * snippet for everything else. Kept pure so the exact commands are unit-tested
 * without spawning anything.
 */

export type ExternalBackend = "claude" | "codex";

/** The argv to register the termco server with a known agent CLI. The token is
 * embedded when a backend stores the header literally; another backend reads it
 * from `TERMCO_MCP_TOKEN` at run time, so the user must export it. */
export function registerCommand(
  backend: ExternalBackend,
  url: string,
  token: string,
): { bin: string; args: string[] } {
  if (backend === "claude") {
    return {
      bin: "claude",
      args: [
        "mcp",
        "add",
        "--transport",
        "http",
        "--scope",
        "user",
        "termco",
        url,
        "--header",
        `Authorization: Bearer ${token}`,
      ],
    };
  }
  return {
    bin: "codex",
    args: [
      "mcp",
      "add",
      "termco",
      "--url",
      url,
      "--bearer-token-env-var",
      "TERMCO_MCP_TOKEN",
    ],
  };
}

/** A copy-paste snippet for an unknown MCP client. JSON for the common
 * `.mcp.json` shape, plus a one-line note about the token. */
export function connectSnippet(url: string, token: string): string {
  const json = JSON.stringify(
    {
      mcpServers: {
        termco: {
          type: "http",
          url,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
  return `${json}\n\n# Or export the token and reference it: TERMCO_MCP_TOKEN=${token}`;
}
// Owned by the mcp-server-native provider plugin.

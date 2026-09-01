import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  WorkspaceEnv,
  WorkspaceExecutionCapability,
  WorkspaceExecutionRequest,
} from "@termco/workspace-base";
import {
  buildRemoteCommand,
  inlineEnvPrefix,
  mcpReverseTunnelOpts,
  portFromEndpoint,
  REMOTE_PATH_PRELUDE,
  REMOTE_TOKEN_PRELUDE,
  remoteProbeCommand,
  reverseTunnelOpts,
  shellQuote,
  sshSpawnArgs,
} from "./remote";
import { configureCodingAgentRuntime } from "./runtime";

const WS = { kind: "ssh" as const, connectionId: "prod", host: "example.com", user: "kev", port: 2222 };

beforeAll(() => {
  configureCodingAgentRuntime({
    execution: {
      prepare(_workspace: WorkspaceEnv, request: WorkspaceExecutionRequest) {
        const [remote, extraOptions = []] = request.args as [string[], string[]?];
        return [
          "-p",
          "2222",
          ...extraOptions,
          "kev@example.com",
          ...remote,
        ];
      },
    } as unknown as WorkspaceExecutionCapability,
  } as never);
});

afterAll(() => configureCodingAgentRuntime(null));

describe("shellQuote", () => {
  it("wraps plain args in single quotes", () => {
    expect(shellQuote("claude")).toBe("'claude'");
    expect(shellQuote("--output-format")).toBe("'--output-format'");
  });

  it("escapes embedded single quotes", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("keeps spaces and shell metachars inert inside the quotes", () => {
    expect(shellQuote("rm -rf / ; echo $HOME")).toBe("'rm -rf / ; echo $HOME'");
  });
});

describe("REMOTE_PATH_PRELUDE", () => {
  it("prepends the user-local install dirs and exports PATH", () => {
    expect(REMOTE_PATH_PRELUDE).toContain("$HOME/.local/bin");
    expect(REMOTE_PATH_PRELUDE).toContain("$HOME/.claude/local");
    expect(REMOTE_PATH_PRELUDE).toContain('"$HOME"/.nvm/versions/node/*/bin');
    expect(REMOTE_PATH_PRELUDE).toContain("export PATH; ");
  });

  it("is pure POSIX sh (no bashisms — the remote shell may be dash)", () => {
    expect(REMOTE_PATH_PRELUDE).not.toContain("[[");
    expect(REMOTE_PATH_PRELUDE).not.toMatch(/\$'(?:[^'])*'/); // $'…' ANSI-C quoting
    expect(REMOTE_PATH_PRELUDE).not.toContain("source ");
  });
});

describe("buildRemoteCommand", () => {
  it("prefixes the PATH prelude, cd's into the cwd, then execs the quoted argv", () => {
    const cmd = buildRemoteCommand("claude", ["-p", "do it", "--json"], "/srv/app");
    expect(cmd).toBe(
      `${REMOTE_PATH_PRELUDE}cd '/srv/app' 2>/dev/null; exec 'claude' '-p' 'do it' '--json'`,
    );
  });

  it("omits the cd when no cwd is given", () => {
    expect(buildRemoteCommand("codex", ["exec"], "")).toBe(
      `${REMOTE_PATH_PRELUDE}exec 'codex' 'exec'`,
    );
  });

  it("neutralizes a malicious prompt argument (no command injection)", () => {
    const cmd = buildRemoteCommand("claude", ["-p", "'; rm -rf ~ #"], "/w");
    // The whole prompt stays inside one quoted token — the `rm` never runs.
    expect(cmd).toContain("'-p' ''\\''; rm -rf ~ #'");
  });
});

describe("sshSpawnArgs", () => {
  it("targets the host with port and passes ONE remote command string", () => {
    const args = sshSpawnArgs(WS, "claude", ["-p", "hi"], "/repo");
    expect(args).toContain("-p");
    expect(args).toContain("2222");
    expect(args).toContain("kev@example.com");
    // The remote command is a single trailing argv element.
    expect(args[args.length - 1]).toBe(
      `${REMOTE_PATH_PRELUDE}cd '/repo' 2>/dev/null; exec 'claude' '-p' 'hi'`,
    );
  });
});

describe("reverse tunnel (ssh approvals)", () => {
  it("portFromEndpoint extracts the loopback port", () => {
    expect(portFromEndpoint("http://127.0.0.1:5599")).toBe("5599");
    expect(portFromEndpoint(undefined)).toBe("");
    expect(portFromEndpoint("garbage")).toBe("");
  });

  it("reverseTunnelOpts builds a -R forward for the endpoint's port", () => {
    expect(reverseTunnelOpts("http://127.0.0.1:5599")).toEqual([
      "-R",
      "5599:127.0.0.1:5599",
    ]);
    expect(reverseTunnelOpts(undefined)).toEqual([]);
  });

  it("sshSpawnArgs threads the -R tunnel opts before the destination", () => {
    const args = sshSpawnArgs(WS, "claude", ["-p", "hi"], "/repo", [
      "-R",
      "5599:127.0.0.1:5599",
    ]);
    const rIdx = args.indexOf("-R");
    const destIdx = args.indexOf("kev@example.com");
    expect(rIdx).toBeGreaterThan(-1);
    expect(rIdx).toBeLessThan(destIdx); // opts precede the destination
  });
});

describe("inlineEnvPrefix (adapter env → remote command)", () => {
  it("inlines quoted, safe-keyed assignments before exec", () => {
    expect(inlineEnvPrefix({ IS_SANDBOX: "1", MAX_THINKING_TOKENS: "12000" })).toBe(
      "IS_SANDBOX='1' MAX_THINKING_TOKENS='12000' ",
    );
  });
  it("is empty for no env", () => {
    expect(inlineEnvPrefix(undefined)).toBe("");
    expect(inlineEnvPrefix({})).toBe("");
  });
  it("drops keys that aren't valid shell identifiers (injection guard)", () => {
    expect(inlineEnvPrefix({ "BAD KEY": "x", OK: "y" })).toBe("OK='y' ");
  });
  it("quotes values so they can't break out of the command", () => {
    expect(inlineEnvPrefix({ V: "a'; rm -rf ~ #" })).toBe("V='a'\\''; rm -rf ~ #' ");
  });
});

describe("buildRemoteCommand env inlining", () => {
  it("inlines IS_SANDBOX before exec for a full-auto ssh run", () => {
    const cmd = buildRemoteCommand("claude", ["-p", "go"], "/root", true, {
      IS_SANDBOX: "1",
    });
    // read-token prelude → PATH → env inline → exec.
    expect(cmd).toContain(REMOTE_TOKEN_PRELUDE);
    expect(cmd).toMatch(/IS_SANDBOX='1' exec /);
    // The token is NOT inlined (it's on stdin).
    expect(cmd).not.toContain("TERMCO_MCP_TOKEN=");
  });
});

describe("MCP over ssh: token-over-stdin + reverse tunnel", () => {
  it("buildRemoteCommand with token reads TERMCO_MCP_TOKEN from stdin before exec", () => {
    const cmd = buildRemoteCommand("claude", ["-p", "hi"], "/repo", true);
    expect(cmd.startsWith(REMOTE_TOKEN_PRELUDE)).toBe(true);
    // The read happens before the PATH prelude and the exec.
    expect(cmd.indexOf("read -r TERMCO_MCP_TOKEN")).toBeLessThan(cmd.indexOf("exec"));
    // The token value is NEVER in the command string (it comes over stdin).
    expect(cmd).not.toMatch(/TERMCO_MCP_TOKEN=/);
  });

  it("buildRemoteCommand without a token omits the stdin prelude", () => {
    const cmd = buildRemoteCommand("claude", ["-p", "hi"], "/repo");
    expect(cmd).not.toContain("read -r TERMCO_MCP_TOKEN");
  });

  it("sshSpawnArgs threads the token wrapper when asked", () => {
    const args = sshSpawnArgs(WS, "claude", ["-p", "hi"], "/repo", [], true);
    expect(args[args.length - 1]).toContain(REMOTE_TOKEN_PRELUDE);
  });

  it("mcpReverseTunnelOpts forwards the MCP port same-port both ends", () => {
    expect(mcpReverseTunnelOpts("http://127.0.0.1:45817/mcp")).toEqual([
      "-R",
      "45817:127.0.0.1:45817",
    ]);
    expect(mcpReverseTunnelOpts(undefined)).toEqual([]);
  });

  it("approval + MCP tunnels can both be present without collision", () => {
    const opts = [
      ...reverseTunnelOpts("http://127.0.0.1:5599"),
      ...mcpReverseTunnelOpts("http://127.0.0.1:45817/mcp"),
    ];
    expect(opts).toEqual(["-R", "5599:127.0.0.1:5599", "-R", "45817:127.0.0.1:45817"]);
  });
});

describe("remoteProbeCommand", () => {
  it("builds a command -v probe emitting the marker, behind the SAME PATH prelude as the spawn", () => {
    expect(remoteProbeCommand("codex")).toBe(
      `${REMOTE_PATH_PRELUDE}command -v 'codex' >/dev/null 2>&1 && echo TCOK`,
    );
  });
});
// Owned by the coding-agent-native provider plugin.

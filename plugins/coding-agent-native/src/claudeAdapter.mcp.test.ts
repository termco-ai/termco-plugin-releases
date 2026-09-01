import { describe, expect, it } from "vitest";
import {
  createClaudeAdapter,
  mcpConfigJson,
  mcpSettings,
} from "./claudeAdapter";

const BASE = { runId: "r1", backend: "claude" as const, prompt: "go", cwd: "/repo" };

describe("claude adapter — MCP injection", () => {
  it("injects --mcp-config with an ENV-REFERENCE bearer (token never in argv)", () => {
    const cmd = createClaudeAdapter().buildCommand({
      ...BASE,
      mcpUrl: "http://127.0.0.1:45817/mcp",
      mcpToken: "SECRET-TOKEN",
    });
    const argv = JSON.stringify(cmd.args);
    // The token is NOT anywhere in argv…
    expect(argv).not.toContain("SECRET-TOKEN");
    // …but the env reference and the URL are.
    expect(argv).toContain("${TERMCO_MCP_TOKEN}");
    expect(argv).toContain("http://127.0.0.1:45817/mcp");
    // Token lands in env.
    expect(cmd.env?.TERMCO_MCP_TOKEN).toBe("SECRET-TOKEN");
  });

  it("emits ONE merged --settings; the approval hook EXCLUDES termco (no double approval)", () => {
    const cmd = createClaudeAdapter().buildCommand({
      ...BASE,
      mcpUrl: "http://127.0.0.1:45817/mcp",
      mcpToken: "t",
      approvalEndpoint: "http://127.0.0.1:5599",
      permissionMode: "default",
    });
    // The backend only honors the last --settings value.
    const settingsBlobs = cmd.args.filter((_a, i) => cmd.args[i - 1] === "--settings");
    expect(settingsBlobs).toHaveLength(1);
    const s = JSON.parse(settingsBlobs[0]);
    // It allows termco tools (our server gates them)…
    expect(s.permissions.allow).toContain("mcp__termco__*");
    // …AND installs the approval hook whose matcher EXCLUDES mcp__termco__*
    // so the backend does not gate them a second time.
    const matcher = s.hooks.PreToolUse[0].matcher;
    expect(matcher).toContain("mcp__(?!termco__)");
    // The matcher matches an external mcp tool but NOT a termco one.
    const re = new RegExp(matcher);
    expect(re.test("mcp__other__do_thing")).toBe(true);
    expect(re.test("mcp__termco__browser_navigate")).toBe(false);
    expect(re.test("Bash")).toBe(true);
  });

  it("bypass turn: endpoint provisioned but NO hook (nothing prompts in full-auto)", () => {
    const cmd = createClaudeAdapter().buildCommand({
      ...BASE,
      mcpUrl: "http://127.0.0.1:45817/mcp",
      mcpToken: "t",
      approvalEndpoint: "http://127.0.0.1:5599",
      permissionMode: "bypass",
    });
    const s = JSON.parse(
      cmd.args.filter((_a, i) => cmd.args[i - 1] === "--settings")[0],
    );
    expect(s.permissions.allow).toEqual(["mcp__termco__*"]);
    expect(s.hooks).toBeUndefined(); // full-auto → no prompting hook
  });

  it("switching to acceptEdits (same endpoint) ADDS the hook — mid-session change works", () => {
    // Same run/endpoint, mode flipped from bypass → acceptEdits on a later turn.
    const cmd = createClaudeAdapter().buildCommand({
      ...BASE,
      approvalEndpoint: "http://127.0.0.1:5599",
      permissionMode: "acceptEdits",
    });
    const s = JSON.parse(
      cmd.args.filter((_a, i) => cmd.args[i - 1] === "--settings")[0],
    );
    expect(s.hooks.PreToolUse[0].matcher).toContain("mcp__(?!termco__)");
    // acceptEdits is not full-auto → IS_SANDBOX stays off.
    expect(cmd.env?.IS_SANDBOX).toBeUndefined();
  });

  it("mcpConfigJson uses http transport + env-ref header", () => {
    const cfg = JSON.parse(mcpConfigJson("http://x/mcp"));
    expect(cfg.mcpServers.termco.type).toBe("http");
    expect(cfg.mcpServers.termco.headers.Authorization).toBe("Bearer ${TERMCO_MCP_TOKEN}");
    expect(JSON.parse(mcpSettings()).permissions.allow).toEqual(["mcp__termco__*"]);
  });

  it("omits all MCP wiring when no server URL is given", () => {
    const cmd = createClaudeAdapter().buildCommand(BASE);
    expect(cmd.args).not.toContain("--mcp-config");
    expect(cmd.env?.TERMCO_MCP_TOKEN).toBeUndefined();
  });

  it("sets IS_SANDBOX=1 for full-auto (Claude's root-guard escape) — only in bypass", () => {
    const full = createClaudeAdapter().buildCommand({ ...BASE, permissionMode: "bypass" });
    expect(full.env?.IS_SANDBOX).toBe("1");
    const edits = createClaudeAdapter().buildCommand({
      ...BASE,
      permissionMode: "acceptEdits",
    });
    expect(edits.env?.IS_SANDBOX).toBeUndefined();
  });
});
// Owned by the coding-agent-native provider plugin.

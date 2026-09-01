import { describe, expect, it } from "vitest";
import type { ApprovalOutcome } from "./driver";
import { formatDecision, parseHookRequest, startApprovalServer } from "./approvalServer";

/** Wait until the server has bound its ephemeral port. */
async function ready(server: { baseUrl(): string }): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (server.baseUrl()) return server.baseUrl();
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("approval server never bound");
}

describe("parseHookRequest", () => {
  it("reads tool_name + tool_input from a hook payload", () => {
    expect(
      parseHookRequest(JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } })),
    ).toEqual({ name: "Bash", input: { command: "ls" } });
  });

  it("accepts camelCase variants and defaults input", () => {
    expect(parseHookRequest(JSON.stringify({ toolName: "Read" }))).toEqual({
      name: "Read",
      input: {},
    });
  });

  it("rejects malformed / nameless payloads", () => {
    expect(parseHookRequest("not json")).toBeNull();
    expect(parseHookRequest(JSON.stringify({ tool_input: {} }))).toBeNull();
  });
});

describe("formatDecision", () => {
  it("emits a PreToolUse allow decision (+ updatedInput)", () => {
    const out = JSON.parse(formatDecision({ allow: true, updatedInput: { command: "ls -la" } }));
    expect(out.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput: { command: "ls -la" },
    });
  });

  it("emits a deny decision with a reason", () => {
    const out = JSON.parse(formatDecision({ allow: false, message: "user declined" }));
    expect(out.hookSpecificOutput).toMatchObject({
      permissionDecision: "deny",
      permissionDecisionReason: "user declined",
    });
  });
});

describe("approval server routing", () => {
  it("routes POST /permit?run= to the driver and returns its decision", async () => {
    const seen: Array<{ runId: string; name: string }> = [];
    const server = startApprovalServer(async (runId, req): Promise<ApprovalOutcome> => {
      seen.push({ runId, name: req.name });
      return { allow: true, updatedInput: { command: "ls -la" } };
    });
    try {
      const base = await ready(server);
      const res = await fetch(`${base}/permit?run=r1`, {
        method: "POST",
        body: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" } }),
      });
      const json = (await res.json()) as { hookSpecificOutput: Record<string, unknown> };
      expect(seen).toEqual([{ runId: "r1", name: "Bash" }]);
      expect(json.hookSpecificOutput).toMatchObject({
        permissionDecision: "allow",
        updatedInput: { command: "ls -la" },
      });
    } finally {
      server.close();
    }
  });

  it("denies a request with no run id", async () => {
    const server = startApprovalServer(async (): Promise<ApprovalOutcome> => ({ allow: true }));
    try {
      const base = await ready(server);
      const res = await fetch(`${base}/permit`, {
        method: "POST",
        body: JSON.stringify({ tool_name: "Bash" }),
      });
      const json = (await res.json()) as { hookSpecificOutput: { permissionDecision: string } };
      expect(json.hookSpecificOutput.permissionDecision).toBe("deny");
    } finally {
      server.close();
    }
  });
});
// Owned by the coding-agent-native provider plugin.

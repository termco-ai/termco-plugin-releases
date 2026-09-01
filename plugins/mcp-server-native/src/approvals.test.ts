import { describe, expect, it, vi } from "vitest";
import {
  createApprovalGate,
  createRememberedRules,
  decideApproval,
  type AskUser,
} from "./approvals";
import type { ResolvedRig } from "./protocol";
import type { TokenIdentity } from "./tokens";

const RUN: TokenIdentity = { kind: "run", token: "t", runId: "r1", rigId: "A", autoApprove: false };
const RUN_AUTO: TokenIdentity = { ...RUN, autoApprove: true };
const USER: TokenIdentity = { kind: "user", id: "u1", label: "opencode", rigId: null, autoApprove: false };
const RIG: ResolvedRig = { rigId: "A", rigName: "A" };

describe("decideApproval", () => {
  const base = { autoApprove: false, rememberedRules: [] as string[] };

  it("allows a read-only tool without asking", () => {
    expect(
      decideApproval({ toolName: "list_tabs", input: {}, needsApproval: false, ...base }),
    ).toEqual({ kind: "allow" });
  });

  it("asks for a mutating tool", () => {
    expect(
      decideApproval({
        toolName: "terminal_run",
        input: { command: "ls" },
        needsApproval: true,
        ...base,
      }),
    ).toEqual({ kind: "ask", catastrophic: false });
  });

  it("always asks when the shared tool policy marks a call mandatory", () => {
    expect(
      decideApproval({
        toolName: "terminal_run",
        input: { command: "rm -rf /" },
        needsApproval: true,
        mandatory: true,
        autoApprove: true,
        rememberedRules: ["terminal_run(rm:*)"], // even a matching rule can't save it
      }),
    ).toEqual({ kind: "ask", catastrophic: true });
  });

  it("auto-approve allows a non-catastrophic mutating tool", () => {
    expect(
      decideApproval({
        toolName: "terminal_run",
        input: { command: "npm test" },
        needsApproval: true,
        autoApprove: true,
        rememberedRules: [],
      }),
    ).toEqual({ kind: "allow" });
  });

  it("a remembered rule allows a matching call", () => {
    expect(
      decideApproval({
        toolName: "terminal_run",
        input: { command: "npm test" },
        needsApproval: true,
        autoApprove: false,
        rememberedRules: ["terminal_run(npm:*)"],
      }),
    ).toEqual({ kind: "allow" });
  });
});

describe("remembered rules are per-source", () => {
  it("does not leak an allow between two sources", () => {
    const rules = createRememberedRules();
    rules.remember(RUN, "terminal_run", { command: "npm test" });
    expect(rules.get(RUN)).toEqual(["terminal_run(npm:*)"]);
    expect(rules.get(USER)).toEqual([]); // a different source sees nothing
  });

  it("forgets a source's rules", () => {
    const rules = createRememberedRules();
    rules.remember(RUN, "list_tabs", {});
    rules.forget(RUN);
    expect(rules.get(RUN)).toEqual([]);
  });
});

describe("createApprovalGate", () => {
  function gate(ask: AskUser, autoApprove = false) {
    const rules = createRememberedRules();
    return {
      rules,
      run: createApprovalGate({ rules, ask, autoApproveFor: () => autoApprove }),
    };
  }

  it("does not ask for a read-only tool", async () => {
    const ask = vi.fn();
    const { run } = gate(ask);
    const res = await run({ identity: RUN, rig: RIG, toolName: "list_tabs", input: {}, needsApproval: false });
    expect(res.allow).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it("asks and relays a denial", async () => {
    const ask = vi.fn(async () => ({ allow: false, message: "no" }));
    const { run } = gate(ask);
    const res = await run({
      identity: RUN,
      rig: RIG,
      toolName: "terminal_run",
      input: { command: "ls" },
      needsApproval: true,
    });
    expect(res.allow).toBe(false);
    expect(res.message).toBe("no");
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ catastrophic: false }));
  });

  it("allow-&-remember records a rule so the next matching call skips the card", async () => {
    const ask = vi.fn(async () => ({ allow: true, always: true }));
    const { run } = gate(ask);
    const call = {
      identity: RUN,
      rig: RIG,
      toolName: "terminal_run",
      input: { command: "npm test" },
      needsApproval: true,
    };
    await run(call);
    await run(call);
    expect(ask).toHaveBeenCalledTimes(1); // second call auto-approved by the rule
  });

  it("never remembers an allow for a mandatory call", async () => {
    const ask = vi.fn(async () => ({ allow: true, always: true }));
    const { rules, run } = gate(ask);
    await run({
      identity: RUN,
      rig: RIG,
      toolName: "terminal_run",
      input: { command: "rm -rf /" },
      needsApproval: true,
      mandatory: true,
    });
    expect(rules.get(RUN)).toEqual([]); // the dangerous allow did not stick
  });

  it("auto-approve skips the card for non-catastrophic calls but not catastrophic ones", async () => {
    const ask = vi.fn(async () => ({ allow: true }));
    const { run } = gate(ask, true);
    await run({ identity: RUN_AUTO, rig: RIG, toolName: "terminal_run", input: { command: "npm i" }, needsApproval: true });
    expect(ask).not.toHaveBeenCalled();
    await run({ identity: RUN_AUTO, rig: RIG, toolName: "terminal_run", input: { command: "sudo reboot" }, needsApproval: true, mandatory: true });
    expect(ask).toHaveBeenCalledTimes(1); // catastrophic still asks
  });
});
// Owned by the mcp-server-native provider plugin.

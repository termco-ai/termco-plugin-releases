/**
 * The MCP approval pipeline — decides whether a tool call runs, asks, or is
 * denied. Mirrors the internal chat's semantics (decision record #8):
 *
 *  1. Catastrophic `terminal_run` → ALWAYS ask (never auto-approvable).
 *  2. Read-only tool (needsApproval=false) → allow.
 *  3. A remembered allow-rule for this source → allow.
 *  4. Token auto-approve (run permissionMode / user token flag) → allow.
 *  5. Otherwise → ask the user.
 *
 * The decision core is pure; asking the user is an injected async seam so the
 * transport/UI wiring stays out of the tested logic. Remembered rules are keyed
 * per SOURCE (`run:<id>` / `token:<id>`) so one agent's "always allow" never
 * leaks to another.
 */

import { makeRule, matchesRule } from "./approvalRules";
import type { ResolvedRig } from "./protocol";
import type { TokenIdentity } from "./tokens";

export type ApprovalDecision =
  | { kind: "allow" }
  | { kind: "ask"; catastrophic: boolean };

/** The static part of the decision (everything except actually asking). */
export function decideApproval(args: {
  toolName: string;
  input: Record<string, unknown>;
  needsApproval: boolean;
  mandatory?: boolean;
  /** This source's auto-approve setting (run permissionMode≈bypass / token). */
  autoApprove: boolean;
  /** Remembered allow-rules for this source. */
  rememberedRules: readonly string[];
}): ApprovalDecision {
  if (args.mandatory) return { kind: "ask", catastrophic: true };

  if (!args.needsApproval) return { kind: "allow" };
  if (matchesRule(args.rememberedRules, args.toolName, args.input)) {
    return { kind: "allow" };
  }
  if (args.autoApprove) return { kind: "allow" };
  return { kind: "ask", catastrophic: false };
}

/** The user's answer to an approval prompt. */
export type ApprovalAnswer = {
  allow: boolean;
  /** Remember this allow for matching future calls from the same source. */
  always?: boolean;
  message?: string;
};

/** How the pipeline asks the user (renderer card). */
export type AskUser = (req: {
  identity: TokenIdentity;
  rig: ResolvedRig;
  toolName: string;
  input: Record<string, unknown>;
  catastrophic: boolean;
}) => Promise<ApprovalAnswer>;

/** A per-source remembered-rules store. */
export function createRememberedRules() {
  const rules = new Map<string, string[]>();
  const keyFor = (identity: TokenIdentity): string =>
    identity.kind === "run" ? `run:${identity.runId}` : `token:${identity.id}`;

  return {
    get: (identity: TokenIdentity): string[] => rules.get(keyFor(identity)) ?? [],
    remember: (identity: TokenIdentity, toolName: string, input: unknown): void => {
      const key = keyFor(identity);
      const rule = makeRule(toolName, input);
      const list = rules.get(key) ?? [];
      if (!list.includes(rule)) list.push(rule);
      rules.set(key, list);
    },
    /** Drop a source's rules (run ended / token revoked). */
    forget: (identity: TokenIdentity): void => {
      rules.delete(keyFor(identity));
    },
  };
}

export type RememberedRules = ReturnType<typeof createRememberedRules>;

/** Build the approval gate the bridge calls before dispatching a tool. */
export function createApprovalGate(deps: {
  rules: RememberedRules;
  ask: AskUser;
  /** Whether this identity auto-approves non-catastrophic calls. */
  autoApproveFor: (identity: TokenIdentity) => boolean;
}) {
  return async (args: {
    identity: TokenIdentity;
    rig: ResolvedRig;
    toolName: string;
    input: Record<string, unknown>;
    needsApproval: boolean;
    mandatory?: boolean;
  }): Promise<{
    allow: boolean;
    outcome: "allowed-once" | "allowed-by-policy" | "rejected";
    responder: "user" | "policy";
    message?: string;
  }> => {
    const decision = decideApproval({
      toolName: args.toolName,
      input: args.input,
      needsApproval: args.needsApproval,
      mandatory: args.mandatory,
      autoApprove: deps.autoApproveFor(args.identity),
      rememberedRules: deps.rules.get(args.identity),
    });
    if (decision.kind === "allow") {
      return {
        allow: true,
        outcome: "allowed-by-policy",
        responder: "policy",
      };
    }

    const answer = await deps.ask({
      identity: args.identity,
      rig: args.rig,
      toolName: args.toolName,
      input: args.input,
      catastrophic: decision.catastrophic,
    });
    if (answer.allow && answer.always) {
      // Never let "always" stick for a catastrophic command.
      if (!decision.catastrophic) {
        deps.rules.remember(args.identity, args.toolName, args.input);
      }
    }
    return {
      allow: answer.allow,
      outcome: answer.allow ? "allowed-once" : "rejected",
      responder: "user",
      ...(answer.message ? { message: answer.message } : {}),
    };
  };
}
// Owned by the mcp-server-native provider plugin.

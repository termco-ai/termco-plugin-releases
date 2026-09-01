/**
 * Backend-adapter contract for the coding-agent driver. Each supported CLI
 * implements this: how to build its argv and environment for a run,
 * and how to translate one line of its stdout into normalized `AgentEvent`s.
 *
 * `parseLine` is a pure, per-line function (some adapters keep small internal
 * state, e.g. delta accumulation) so it can be unit-tested without spawning a
 * process. Everything above the adapter speaks only the normalized protocol.
 */

import type {
  AgentEvent,
  AgentPermissionMode,
  AgentRunStartParams,
} from "@termco/agents-base";

export type BuiltCommand = {
  bin: string;
  args: string[];
  /** Extra env merged over the inherited process env. */
  env?: Record<string, string>;
};

export interface BackendAdapter {
  /** Assemble the CLI invocation for a run (cwd is applied via spawn options). */
  buildCommand(params: AgentRunStartParams): BuiltCommand;
  /**
   * Translate one raw stdout line into zero or more normalized events. Blank or
   * unrecognized lines return `[]`. May keep small internal state across calls,
   * so a fresh adapter instance is created per run.
  */
  parseLine(line: string): AgentEvent[];
}

/** Map the normalized permission mode onto a backend's own flag value. */
export type PermissionModeMap = Record<AgentPermissionMode, string>;
// Owned by the coding-agent-native provider plugin.

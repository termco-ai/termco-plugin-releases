/**
 * Hook config merge. Idempotently inserts Termco's hook
 * groups into the agent's JSON config, replacing our previous groups + empties.
 */
import { hookCommand } from "./hooks";
import type { AgentSpec } from "./spec";

type Json = Record<string, unknown>;

const OWNED_MARKERS = ["notify;Termco;", "termco;notify", "__termco_notify"];

function isOurs(group: unknown): boolean {
  const hooks = (group as Json)?.hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => {
    const c = (h as Json)?.command;
    return typeof c === "string" && OWNED_MARKERS.some((m) => c.includes(m));
  });
}

function isEmptyGroup(group: unknown): boolean {
  const hooks = (group as Json)?.hooks;
  return !Array.isArray(hooks) || hooks.length === 0;
}

export function mergeHooks(root: unknown, spec: AgentSpec): Json {
  const obj: Json = root && typeof root === "object" ? { ...(root as Json) } : {};
  let hooks = obj.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) hooks = {};
  const hooksObj = { ...(hooks as Json) };

  for (const [event, marker] of spec.events) {
    let arr = hooksObj[event];
    if (!Array.isArray(arr)) arr = [];
    const kept = (arr as unknown[]).filter((g) => !isOurs(g) && !isEmptyGroup(g));
    const group: Json = {
      hooks: [{ type: "command", command: hookCommand(spec, marker) }],
    };
    if (spec.matcher) group.matcher = "*";
    kept.push(group);
    hooksObj[event] = kept;
  }
  obj.hooks = hooksObj;
  return obj;
}

export function existingConfig(contents: string | undefined, path: string): Json {
  if (contents && contents.trim().length > 0) {
    try {
      return JSON.parse(contents) as Json;
    } catch (e) {
      throw new Error(`${path} is not valid JSON (${(e as Error).message}); refusing to overwrite`);
    }
  }
  return {};
}

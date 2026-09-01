/**
 * The part of every request that isn't the conversation.
 *
 * The system prompt, the carried summary and ~40 tool schemas are sent on every
 * single turn and were counted by nothing: `runStream` measured `history` alone,
 * so the budget was short by a five-figure constant before a word was typed.
 *
 * Tool schemas cannot be measured exactly from here — we do not see the JSON the
 * SDK ultimately serialises. That is fine, because the error is constant and
 * `anchor.ts` removes it entirely: as soon as the provider reports usage for a
 * real request, the anchor supersedes this estimate. This only has to be close
 * enough for the first turn.
 */

import { djb2 } from "../hash";
import { countText } from "./encoder";

/** Rough framing per tool: name, wrapper, separators. */
const PER_TOOL_TOKENS = 12;

export type OverheadInput = {
  /** System prompt sections: stable prompt, plan mode, carried summary. */
  system?: readonly (string | undefined | null)[];
  /** The tool set as handed to `streamText`. */
  tools?: Record<string, unknown>;
  /** Which of them are actually enabled this turn. */
  activeTools?: readonly string[];
};

const cache = new Map<number, number>();

function schemaTokens(tool: unknown): number {
  if (!tool || typeof tool !== "object") return PER_TOOL_TOKENS;
  const t = tool as { description?: unknown; inputSchema?: unknown };
  let n = PER_TOOL_TOKENS;
  if (typeof t.description === "string") n += countText(t.description);
  if (t.inputSchema) {
    try {
      n += countText(JSON.stringify(t.inputSchema) ?? "");
    } catch {
      n += 40; // a schema we cannot serialise still costs something
    }
  }
  return n;
}

/**
 * Tokens the request carries before any history.
 *
 * Memoised on the shape of the input: the system prompt and tool set are stable
 * for a given model + persona + enabled-tools combination, so this runs once
 * per configuration rather than once per send.
 */
export function countRequestOverhead(input: OverheadInput): number {
  const sections = (input.system ?? []).filter(
    (s): s is string => typeof s === "string" && s.length > 0,
  );
  const names = input.activeTools
    ? [...input.activeTools].sort()
    : Object.keys(input.tools ?? {}).sort();

  const key = djb2(
    `${sections.map((s) => `${s.length}:${djb2(s)}`).join("|")}#${names.join(",")}`,
  );
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let n = 0;
  for (const s of sections) n += countText(s);
  const tools = input.tools ?? {};
  for (const name of names) {
    n += countText(name) + schemaTokens(tools[name]);
  }

  if (cache.size > 64) cache.clear();
  cache.set(key, n);
  return n;
}

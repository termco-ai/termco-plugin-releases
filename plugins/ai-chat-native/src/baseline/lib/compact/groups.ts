import type { UIMessage } from "@ai-sdk/react";
import { countUIMessages } from "../tokens";

export type TurnGroup = {
  start: number;
  end: number;
  messages: UIMessage[];
  tokens: number;
};

export const MIN_GROUPS = 2;

export function groupMessages(
  messages: readonly UIMessage[],
  countTokens: (messages: readonly UIMessage[]) => number = countUIMessages,
): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let start = -1;
  const push = (from: number, to: number) => {
    const slice = messages.slice(from, to);
    groups.push({
      start: from,
      end: to,
      messages: slice,
      tokens: countTokens(slice),
    });
  };
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index].role !== "user") continue;
    if (start === -1 && index > 0) push(0, index);
    else if (start !== -1) push(start, index);
    start = index;
  }
  if (start !== -1) push(start, messages.length);
  else if (messages.length > 0) push(0, messages.length);
  return groups;
}

export function flattenGroups(groups: readonly TurnGroup[]): UIMessage[] {
  return groups.flatMap((group) => group.messages);
}

export function preserveCount(
  groups: readonly TurnGroup[],
  options: { tokenGap?: number; min?: number } = {},
): number {
  if (groups.length <= 1) return Math.max(1, groups.length);
  let preserve = Math.max(1, options.min ?? 1);
  if (options.tokenGap && options.tokenGap > 0) {
    let tokens = 0;
    let count = 0;
    for (
      let index = groups.length - 1;
      index >= 0 && tokens < options.tokenGap;
      index -= 1
    ) {
      tokens += groups[index].tokens;
      count += 1;
    }
    preserve = Math.max(preserve, count);
  }
  return Math.min(preserve, Math.max(1, Math.floor(groups.length / 2)));
}

export function splitAtGroup(
  groups: readonly TurnGroup[],
  preserve: number,
): {
  head: UIMessage[];
  tail: UIMessage[];
  headGroups: number;
  tailGroups: number;
} {
  const keep = Math.min(Math.max(1, preserve), groups.length);
  const cut = groups.length - keep;
  return {
    head: flattenGroups(groups.slice(0, cut)),
    tail: flattenGroups(groups.slice(cut)),
    headGroups: cut,
    tailGroups: keep,
  };
}

const TERMINAL_TOOL_STATES = new Set(["output-available", "output-error"]);

function unfinishedToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const value = part as { type?: unknown; state?: unknown };
  if (typeof value.type !== "string") return false;
  if (!value.type.startsWith("tool-") && value.type !== "dynamic-tool") {
    return false;
  }
  return (
    typeof value.state === "string" && !TERMINAL_TOOL_STATES.has(value.state)
  );
}

export function sanitizeTail(tail: readonly UIMessage[]): UIMessage[] {
  let changed = false;
  const result: UIMessage[] = [];
  for (const message of tail) {
    const parts = message.parts ?? [];
    const kept = parts.filter((part) => !unfinishedToolPart(part));
    if (kept.length === parts.length) {
      result.push(message);
      continue;
    }
    changed = true;
    if (kept.length > 0) result.push({ ...message, parts: kept } as UIMessage);
  }
  return changed ? result : (tail as UIMessage[]);
}

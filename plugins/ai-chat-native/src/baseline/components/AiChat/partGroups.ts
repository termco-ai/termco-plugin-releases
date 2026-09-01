/**
 * Grouping logic for a message's parts: consecutive `read_file` tool parts are
 * collapsed into a single "reads" group, everything else stays a singleton.
 * Pure helpers over the AI SDK part shapes — no React.
 */

import type { UIMessagePart } from "ai";
import type { TermcoDataParts } from "../../lib/agent/uiMessage";

/** Data parts are named now (see `lib/agent/uiMessage.ts`); they used to be
 * pinned to `Record<string, never>`, which switched the channel off. */
export type AnyPart = UIMessagePart<TermcoDataParts, Record<string, never>>;

export type Group =
  | { kind: "single"; part: AnyPart; idx: number; key: string }
  | { kind: "reads"; parts: AnyPart[]; key: string };

export function partType(p: AnyPart): string {
  return (p as { type?: string }).type ?? "";
}

function isReadFilePart(p: AnyPart): boolean {
  // Termco's `read_file` and the coding-agent `Read` tool.
  if (partType(p) !== "tool-read_file" && partType(p) !== "tool-Read")
    return false;
  const state = (p as { state?: string }).state ?? "";
  return state !== "approval-requested";
}

function partKey(p: AnyPart, idx: number): string {
  const tc = (p as { toolCallId?: string }).toolCallId;
  if (tc) return tc;
  const id = (p as { approval?: { id?: string } }).approval?.id;
  if (id) return id;
  return `i-${idx}`;
}

export function buildPartGroups(parts: AnyPart[]): Group[] {
  const out: Group[] = [];
  let run: { parts: AnyPart[]; startIdx: number } | null = null;
  const flushRun = () => {
    if (!run) return;
    if (run.parts.length >= 2) {
      out.push({
        kind: "reads",
        parts: run.parts,
        key: `reads-${partKey(run.parts[0], run.startIdx)}`,
      });
    } else {
      run.parts.forEach((p, k) => {
        const idx = run!.startIdx + k;
        out.push({ kind: "single", part: p, idx, key: partKey(p, idx) });
      });
    }
    run = null;
  };
  parts.forEach((p, i) => {
    if (isReadFilePart(p)) {
      if (!run) run = { parts: [], startIdx: i };
      run.parts.push(p);
      return;
    }
    flushRun();
    out.push({ kind: "single", part: p, idx: i, key: partKey(p, i) });
  });
  flushRun();
  return out;
}

export function readPathFromPart(p: AnyPart): string | null {
  // The native tool uses `path`; the external tool uses `file_path`.
  const input = (p as { input?: { path?: unknown; file_path?: unknown } })
    .input;
  const path = input?.path ?? input?.file_path;
  return typeof path === "string" && path.length > 0 ? path : null;
}

export function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

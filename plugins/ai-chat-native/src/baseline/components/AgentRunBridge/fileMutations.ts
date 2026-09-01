/**
 * File-mutation extraction + local diff derivation for the AgentRunBridge.
 * Owns: parsing write_file/edit/multi_edit tool parts into a normalized
 * mutation, applying edits locally to derive proposed content, and reading
 * the on-disk original (respecting the fs read guard).
 */

import type { ToolUIPart, UIMessagePart } from "ai";
import { native } from "../../lib/native";
import { checkReadable } from "../../lib/security";

type WriteFileInput = { path?: unknown; content?: unknown };

type ToolPartLike = ToolUIPart & {
  approval?: { id: string };
  input?: WriteFileInput;
};

export type AnyPart = UIMessagePart<
  Record<string, never>,
  Record<string, never>
>;

export type EditOp = {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

type FileMutation =
  | {
      state: string;
      approvalId: string | null;
      path: string;
      derive: { kind: "literal"; content: string };
    }
  | {
      state: string;
      approvalId: string | null;
      path: string;
      derive: { kind: "edits"; edits: EditOp[] };
    };

export function extractFileMutation(part: AnyPart): FileMutation | null {
  const type = (part as { type?: string }).type;
  const p = part as ToolPartLike;
  const state = (p as { state?: string }).state ?? "";
  const approvalId = p.approval?.id ?? null;

  if (type === "tool-write_file") {
    const input = (p.input ?? {}) as WriteFileInput;
    const path = typeof input.path === "string" ? input.path : "";
    const content = typeof input.content === "string" ? input.content : "";
    if (!path) return null;
    return { state, approvalId, path, derive: { kind: "literal", content } };
  }
  if (type === "tool-edit") {
    const input = (p.input ?? {}) as {
      path?: unknown;
      old_string?: unknown;
      new_string?: unknown;
      replace_all?: unknown;
    };
    const path = typeof input.path === "string" ? input.path : "";
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    if (!path) return null;
    return {
      state,
      approvalId,
      path,
      derive: {
        kind: "edits",
        edits: [
          {
            old_string: oldStr,
            new_string: newStr,
            replace_all: Boolean(input.replace_all),
          },
        ],
      },
    };
  }
  if (type === "tool-multi_edit") {
    const input = (p.input ?? {}) as { path?: unknown; edits?: unknown };
    const path = typeof input.path === "string" ? input.path : "";
    if (!path || !Array.isArray(input.edits)) return null;
    const edits: EditOp[] = (input.edits as Record<string, unknown>[])
      .map((e) => ({
        old_string: typeof e.old_string === "string" ? e.old_string : "",
        new_string: typeof e.new_string === "string" ? e.new_string : "",
        replace_all: Boolean(e.replace_all),
      }))
      .filter((e) => e.old_string.length > 0);
    if (edits.length === 0) return null;
    return { state, approvalId, path, derive: { kind: "edits", edits } };
  }
  return null;
}

export function applyEditsLocally(
  original: string,
  edits: EditOp[],
): { ok: true; content: string } | { ok: false } {
  let content = original;
  for (const e of edits) {
    if (e.old_string === e.new_string || e.old_string.length === 0)
      return { ok: false };
    if (e.replace_all) {
      if (!content.includes(e.old_string)) return { ok: false };
      content = content.split(e.old_string).join(e.new_string);
    } else {
      const first = content.indexOf(e.old_string);
      if (first === -1) return { ok: false };
      const second = content.indexOf(e.old_string, first + 1);
      if (second !== -1) return { ok: false };
      content =
        content.slice(0, first) +
        e.new_string +
        content.slice(first + e.old_string.length);
    }
  }
  return { ok: true, content };
}

export async function readOriginal(
  abs: string,
): Promise<{ content: string; isNewFile: boolean }> {
  // The fs guard rejects sensitive paths even on read; mirror that here so
  // the user sees an empty "before" rather than an error tab.
  const safety = checkReadable(abs);
  if (!safety.ok) return { content: "", isNewFile: false };
  try {
    const r = await native.readFile(abs);
    if (r.kind === "text") return { content: r.content, isNewFile: false };
    // Binary or oversized — we can't render the original sensibly. Show the
    // proposed content as a "new" view; the user can still cancel.
    return { content: "", isNewFile: false };
  } catch (e) {
    const msg = String(e).toLowerCase();
    const notFound =
      msg.includes("no such file") ||
      msg.includes("not found") ||
      msg.includes("os error 2");
    return { content: "", isNewFile: notFound };
  }
}

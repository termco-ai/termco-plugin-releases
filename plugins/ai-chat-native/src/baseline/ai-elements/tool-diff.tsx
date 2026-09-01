/**
 * Compact line-diff renderer for coding-agent file-mutation tools so a change shows as
 * a real diff instead of raw tool input. All display; no I/O.
 *
 * Two input shapes are supported:
 *  - old/new strings (Edit/MultiEdit) or a whole file body (Write): we compute a
 *    line-level LCS diff here.
 *  - a pre-formatted unified patch: parse its +/- lines
 *    directly rather than recompute.
 *
 * Diffs are capped so a huge file can't stall the transcript.
 */

import { cn } from "@termco/ui";
import { memo, useMemo } from "react";

/** One rendered diff line. `context` shows unchanged lines around edits. */
export type DiffLine = { kind: "add" | "del" | "context"; text: string };

const MAX_LINES = 400;

/** Longest-common-subsequence line diff of `a` → `b`. Capped at MAX_LINES each
 * side so a massive file degrades gracefully instead of hanging. */
export function lineDiff(a: string, b: string): DiffLine[] {
  // "".split("\n") is [""], which would show a phantom blank line — treat an
  // empty side as no lines.
  const al = a === "" ? [] : a.split("\n");
  const bl = b === "" ? [] : b.split("\n");
  if (al.length > MAX_LINES || bl.length > MAX_LINES) {
    // Too large for an O(n·m) table — fall back to a blunt block diff.
    return [
      ...al.slice(0, MAX_LINES).map((t) => ({ kind: "del" as const, text: t })),
      ...bl.slice(0, MAX_LINES).map((t) => ({ kind: "add" as const, text: t })),
    ];
  }
  const n = al.length;
  const m = bl.length;
  // lcs[i][j] = LCS length of al[i..] and bl[j..].
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        al[i] === bl[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (al[i] === bl[j]) {
      out.push({ kind: "context", text: al[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "del", text: al[i] });
      i++;
    } else {
      out.push({ kind: "add", text: bl[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: "del", text: al[i++] });
  while (j < m) out.push({ kind: "add", text: bl[j++] });
  return out;
}

/** Parse a unified-diff patch body into rendered lines. */
export function parsePatch(patch: string): DiffLine[] {
  const out: DiffLine[] = [];
  for (const raw of patch.split("\n").slice(0, MAX_LINES)) {
    if (raw.startsWith("+++") || raw.startsWith("---") || raw.startsWith("@@")) {
      out.push({ kind: "context", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1) });
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1) });
    } else {
      out.push({ kind: "context", text: raw.replace(/^ /, "") });
    }
  }
  return out;
}

/** Extract diff lines from a coding-agent tool's `input`, or null if the shape
 * isn't a recognized file mutation. `toolName` is the normalized agent name. */
export function diffFromInput(
  toolName: string,
  input: unknown,
): { lines: DiffLine[]; path: string | null } | null {
  if (!input || typeof input !== "object") return null;
  const i = input as Record<string, unknown>;
  const str = (k: string) => (typeof i[k] === "string" ? (i[k] as string) : null);
  const path = str("file_path") ?? str("path") ?? null;
  const n = toolName.toLowerCase();

  if (n === "apply_patch" || n === "applypatch") {
    const patch = str("patch") ?? str("input") ?? str("content");
    if (!patch) return null;
    return { lines: parsePatch(patch), path };
  }
  if (n === "write" || n === "write_file") {
    const content = str("content") ?? str("contents") ?? str("file_text");
    if (content == null) return null;
    return { lines: lineDiff("", content), path };
  }
  if (n === "edit") {
    const oldS = str("old_string");
    const newS = str("new_string");
    if (oldS == null || newS == null) return null;
    return { lines: lineDiff(oldS, newS), path };
  }
  if (n === "multiedit" || n === "multi_edit") {
    const edits = Array.isArray(i.edits) ? i.edits : null;
    if (!edits) return null;
    const lines: DiffLine[] = [];
    for (const e of edits) {
      if (!e || typeof e !== "object") continue;
      const ed = e as Record<string, unknown>;
      const oldS = typeof ed.old_string === "string" ? ed.old_string : "";
      const newS = typeof ed.new_string === "string" ? ed.new_string : "";
      lines.push(...lineDiff(oldS, newS));
    }
    return lines.length ? { lines, path } : null;
  }
  return null;
}

/** Counts for the collapsed summary. */
export function diffCounts(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
  }
  return { added, removed };
}

export const ToolDiff = memo(function ToolDiff({
  toolName,
  input,
}: {
  toolName: string;
  input: unknown;
}) {
  const diff = useMemo(() => diffFromInput(toolName, input), [toolName, input]);
  if (!diff) return null;
  return <DiffView lines={diff.lines} path={diff.path} />;
});

/** The presentation half, usable with any pair of sides — the rich-view
 * `diff` card renders through this too. Pure display, no tool coupling. */
export const DiffView = memo(function DiffView({
  lines,
  path,
}: {
  lines: DiffLine[];
  path?: string | null;
}) {
  const { added, removed } = diffCounts(lines);

  return (
    <div className="overflow-hidden rounded-md border border-border/50">
      {/* Filepath header bar with add/remove counts. */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/40 px-2 py-1 text-xs">
        {path ? (
          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
            {path}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {added > 0 ? (
          <span className="shrink-0 rounded bg-emerald-500/15 px-1 font-mono font-medium text-emerald-600 dark:text-emerald-400">
            +{added}
          </span>
        ) : null}
        {removed > 0 ? (
          <span className="shrink-0 rounded bg-destructive/15 px-1 font-mono font-medium text-destructive">
            -{removed}
          </span>
        ) : null}
      </div>
      {/* Diff body: a tinted change-marker gutter + the code line. */}
      <div className="max-h-80 overflow-auto font-mono text-xs leading-[1.5]">
        {lines.map((l, idx) => (
          <div
            key={idx}
            className={cn(
              "flex",
              l.kind === "add" && "bg-emerald-500/10",
              l.kind === "del" && "bg-destructive/10",
            )}
          >
            <span
              className={cn(
                "w-5 shrink-0 select-none text-center",
                l.kind === "add" &&
                  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                l.kind === "del" && "bg-destructive/20 text-destructive",
                l.kind === "context" && "text-muted-foreground/40",
              )}
            >
              {l.kind === "add" ? "+" : l.kind === "del" ? "-" : ""}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 whitespace-pre-wrap px-2",
                l.kind === "add" && "text-emerald-700 dark:text-emerald-300",
                l.kind === "del" && "text-destructive",
                l.kind === "context" && "text-muted-foreground",
              )}
            >
              {l.text || " "}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export type ReviewDiffLineKind = "meta" | "hunk" | "context" | "added" | "removed";

export interface ReviewDiffLine {
  key: string;
  kind: ReviewDiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface ReviewSplitDiffCell {
  kind: "context" | "added" | "removed";
  text: string;
  line: number;
}

export type ReviewSplitDiffRow =
  | { key: string; kind: "meta" | "hunk"; text: string }
  | {
      key: string;
      kind: "content";
      old: ReviewSplitDiffCell | null;
      new: ReviewSplitDiffCell | null;
    };

export function reviewDiffLines(patch: string): ReviewDiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  return patch.split("\n").map((text, index) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (text.startsWith("diff --git ")) inHunk = false;
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { key: `${index}:hunk`, kind: "hunk", text, oldLine: null, newLine: null };
    }
    if (inHunk && text.startsWith("+")) {
      const line = { key: `${index}:added`, kind: "added" as const, text, oldLine: null, newLine };
      newLine += 1;
      return line;
    }
    if (inHunk && text.startsWith("-")) {
      const line = {
        key: `${index}:removed`,
        kind: "removed" as const,
        text,
        oldLine,
        newLine: null,
      };
      oldLine += 1;
      return line;
    }
    if (inHunk && text.startsWith(" ")) {
      const line = { key: `${index}:context`, kind: "context" as const, text, oldLine, newLine };
      oldLine += 1;
      newLine += 1;
      return line;
    }
    return { key: `${index}:meta`, kind: "meta", text, oldLine: null, newLine: null };
  });
}

function cell(line: ReviewDiffLine, side: "old" | "new"): ReviewSplitDiffCell {
  const number = side === "old" ? line.oldLine : line.newLine;
  if (
    number === null ||
    (line.kind !== "context" && line.kind !== "added" && line.kind !== "removed")
  ) {
    throw new Error("Only numbered diff lines can become split cells.");
  }
  return {
    kind: line.kind,
    text: line.text.slice(1),
    line: number,
  };
}

/** Keep patch order for a single-column view, including all removed lines
 * before their replacements. Context retains both positions for comments. */
export function reviewUnifiedDiffRows(patch: string): ReviewSplitDiffRow[] {
  return reviewDiffLines(patch).map((line) => {
    if (line.kind === "meta" || line.kind === "hunk") {
      return { key: line.key, kind: line.kind, text: line.text };
    }
    return {
      key: line.key,
      kind: "content",
      old: line.oldLine === null ? null : cell(line, "old"),
      new: line.newLine === null ? null : cell(line, "new"),
    };
  });
}

/**
 * Align a unified patch into the two-column shape used by Termco's regular
 * diff surface. Replacement runs are paired by position; unmatched lines get
 * an empty spacer on the opposite side.
 */
export function reviewSplitDiffRows(patch: string): ReviewSplitDiffRow[] {
  const lines = reviewDiffLines(patch);
  const rows: ReviewSplitDiffRow[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.kind === "meta" || line.kind === "hunk") {
      rows.push({ key: line.key, kind: line.kind, text: line.text });
      index += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({
        key: line.key,
        kind: "content",
        old: cell(line, "old"),
        new: cell(line, "new"),
      });
      index += 1;
      continue;
    }

    const removed: ReviewSplitDiffCell[] = [];
    const added: ReviewSplitDiffCell[] = [];
    const start = index;
    while (index < lines.length && ["removed", "added"].includes(lines[index].kind)) {
      const changed = lines[index];
      if (changed.kind === "removed") removed.push(cell(changed, "old"));
      if (changed.kind === "added") added.push(cell(changed, "new"));
      index += 1;
    }
    for (let offset = 0; offset < Math.max(removed.length, added.length); offset += 1) {
      rows.push({
        key: `${start}:change:${offset}`,
        kind: "content",
        old: removed[offset] ?? null,
        new: added[offset] ?? null,
      });
    }
  }
  return rows;
}

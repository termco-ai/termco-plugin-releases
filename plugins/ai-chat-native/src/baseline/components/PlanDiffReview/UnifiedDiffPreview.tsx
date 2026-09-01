/**
 * UnifiedDiffPreview — renders a coarse, at-a-glance unified diff (removed
 * lines then added lines) for a single queued edit's expanded row.
 */

import { cn } from "@termco/ui";

export function UnifiedDiffPreview({
  original,
  proposed,
}: {
  original: string;
  proposed: string;
}) {
  // Coarse line-level diff (LCS-lite via set membership). For real diffs
  // we'd reach for a library; this is good enough for at-a-glance review.
  const a = original.split("\n");
  const b = proposed.split("\n");
  const setA = new Set(a);
  const setB = new Set(b);

  const lines: Array<{ kind: "add" | "del" | "ctx"; text: string }> = [];
  // First pass: removed (in a, not in b).
  for (const l of a) if (!setB.has(l)) lines.push({ kind: "del", text: l });
  // Then: added (in b, not in a).
  for (const l of b) if (!setA.has(l)) lines.push({ kind: "add", text: l });

  if (lines.length === 0) {
    return (
      <div className="text-xs italic text-muted-foreground">
        no line-level changes
      </div>
    );
  }

  const MAX = 80;
  const shown = lines.slice(0, MAX);
  const rest = lines.length - shown.length;

  return (
    <div className="overflow-hidden rounded border border-border/40 font-mono text-xs leading-relaxed">
      <div className="max-h-72 overflow-auto">
        {shown.map((l, i) => (
          <div
            key={i}
            className={cn(
              "flex whitespace-pre",
              l.kind === "add"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            <span className="w-4 shrink-0 select-none px-1 text-center opacity-70">
              {l.kind === "add" ? "+" : "-"}
            </span>
            <span className="min-w-0 flex-1 overflow-x-auto pr-2">
              {l.text || " "}
            </span>
          </div>
        ))}
        {rest > 0 ? (
          <div className="px-2 py-1 text-xs italic text-muted-foreground">
            … {rest} more changes
          </div>
        ) : null}
      </div>
    </div>
  );
}

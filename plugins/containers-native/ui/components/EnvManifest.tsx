/**
 * The container's environment as a secret-aware manifest — the detail tab's
 * signature element. Mono KEY=value rows; keys dimmed, values bright. Values
 * flagged secret (by key pattern or high entropy) render masked with a per-row
 * reveal toggle and copy. Reveal is transient (not persisted): reopening the
 * tab re-masks. Collapsible with a count badge; long values scroll inside their
 * own box so the tab body never scrolls sideways.
 */
import ui from "@termco/ui";
import {
  Copy01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type { EnvVar } from "../lib/inspectParse";

const { cn } = ui;

export function EnvManifest({ env }: { env: EnvVar[] }) {
  const [open, setOpen] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const secretCount = env.filter((e) => e.secret).length;

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <section className="rounded-lg border border-border/50 bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
          Environment
        </span>
        <span className="inline-flex h-4 items-center rounded-full border border-border/50 px-1.5 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
          {env.length}
        </span>
        {secretCount > 0 ? (
          <span className="inline-flex h-4 items-center rounded-full bg-amber-500/15 px-1.5 font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
            {secretCount} secret
          </span>
        ) : null}
        <span className="ml-auto font-mono text-xs text-muted-foreground/55">
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        env.length > 0 ? (
          <div className="flex flex-col divide-y divide-border/30 border-t border-border/40">
            {env.map((e) => (
              <EnvRow
                key={e.key}
                item={e}
                revealed={revealed.has(e.key)}
                onToggle={() => toggleReveal(e.key)}
              />
            ))}
          </div>
        ) : (
          <div className="border-t border-border/40 px-3 py-2 text-xs text-muted-foreground/60">
            No environment variables.
          </div>
        )
      ) : null}
    </section>
  );
}

function EnvRow({
  item,
  revealed,
  onToggle,
}: {
  item: EnvVar;
  revealed: boolean;
  onToggle: () => void;
}) {
  const masked = item.secret && !revealed;
  return (
    <div className="group/env flex items-baseline gap-2 px-3 py-[5px]">
      <span
        className="shrink-0 select-text font-mono text-xs text-muted-foreground/70"
        title={item.key}
      >
        {item.key}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground/35">
        =
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 select-text overflow-x-auto whitespace-nowrap font-mono text-xs",
          masked
            ? "text-amber-600/80 dark:text-amber-400/80"
            : "text-foreground/90",
        )}
        title={masked ? "hidden — reveal to view" : item.value}
      >
        {masked
          ? "••••••••••••"
          : item.value || (
              <span className="text-muted-foreground/40">(empty)</span>
            )}
      </span>
      {item.secret ? (
        <button
          type="button"
          aria-label={revealed ? "Hide value" : "Reveal value"}
          onClick={onToggle}
          className="shrink-0 opacity-0 transition-opacity group-hover/env:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon
            icon={revealed ? ViewOffSlashIcon : ViewIcon}
            size={12}
            strokeWidth={1.75}
          />
        </button>
      ) : null}
      <button
        type="button"
        aria-label={`Copy ${item.key}`}
        onClick={() => void navigator.clipboard.writeText(item.value)}
        className="shrink-0 opacity-0 transition-opacity group-hover/env:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.75} />
      </button>
    </div>
  );
}

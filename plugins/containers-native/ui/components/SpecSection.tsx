/**
 * A titled block in the container detail Spec column: 10px uppercase label
 * (app convention), an optional count badge, and an optional collapse toggle.
 * Content is arbitrary; wide content should scroll inside its own box.
 */
import { useState } from "react";

export function SpecSection({
  title,
  count,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = collapsible ? open : true;

  const header = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/75">
        {title}
      </span>
      {count !== undefined ? (
        <span className="inline-flex h-4 items-center rounded-full border border-border/50 px-1.5 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      ) : null}
      {collapsible ? (
        <span className="ml-auto font-mono text-xs text-muted-foreground/55">
          {open ? "▾" : "▸"}
        </span>
      ) : null}
    </>
  );

  return (
    <section className="rounded-lg border border-border/50 bg-card/60">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2">{header}</div>
      )}
      {shown ? (
        <div className="border-t border-border/40 px-3 py-2">{children}</div>
      ) : null}
    </section>
  );
}

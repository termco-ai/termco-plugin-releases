/**
 * The rich views themselves — one component per `ViewSpec.kind`.
 *
 * All display + local interaction (sorting, expanding, selecting). Nothing here
 * talks to the agent; a row that points at code opens it through the shared
 * event bus (`shared.ts`). The chart is loaded lazily because recharts is
 * heavy and most transcripts never show one.
 */

import { Checkbox } from "@termco/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@termco/ui";
import { cn } from "@termco/ui";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  File01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useMemo, useState } from "react";
import type { ViewSpec } from "./types";
import {
  bySeverity,
  cellText,
  formatRef,
  openRef,
  SEVERITY_BADGE,
  SEVERITY_DOT,
  SEVERITY_TEXT,
  shortRef,
} from "./shared";

type Selection = {
  /** Labels the user ticked; `undefined` when the view isn't selectable. */
  selected?: Set<string>;
  onToggle?: (label: string) => void;
};

/**
 * One row of a list view. Renders a real `<button>` when it leads somewhere —
 * so the surrounding `<li>` keeps its list semantics and keyboard handling
 * comes for free — and a plain `<div>` otherwise.
 */
function Row({
  as,
  onClick,
  title,
  children,
}: {
  as: "button" | "div";
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const className = cn(
    "flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs",
    as === "button" && "cursor-pointer hover:bg-muted/40",
  );
  if (as === "div") return <div className={className}>{children}</div>;
  return (
    <button type="button" className={className} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- table --- */

export const TableView = memo(function TableView({
  view,
  selection,
}: {
  view: Extract<ViewSpec, { kind: "table" }>;
  selection?: Selection;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const rows = useMemo(() => {
    if (!sort) return view.rows;
    const { key, dir } = sort;
    return [...view.rows].sort((a, b) => {
      const av = a.cells[key];
      const bv = b.cells[key];
      if (typeof av === "number" && typeof bv === "number")
        return (av - bv) * dir;
      return cellText(av).localeCompare(cellText(bv)) * dir;
    });
  }, [view.rows, sort]);

  return (
    <div className="overflow-x-auto">
      <Table className="text-xs">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection?.selected ? <TableHead className="w-8" /> : null}
            {view.columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <TableHead
                  key={c.key}
                  className={cn(
                    "h-7 cursor-pointer select-none px-2 text-xs",
                    c.align === "right" && "text-right",
                  )}
                  onClick={() =>
                    setSort((s) =>
                      s?.key === c.key
                        ? { key: c.key, dir: s.dir === 1 ? -1 : 1 }
                        : { key: c.key, dir: 1 },
                    )
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    {active ? (
                      <HugeiconsIcon
                        icon={sort.dir === 1 ? ArrowUp01Icon : ArrowDown01Icon}
                        size={10}
                        strokeWidth={2}
                      />
                    ) : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const key =
              cellText(r.cells[view.columns[0]?.key ?? ""]) || `r${i}`;
            return (
              <TableRow
                key={`${key}-${i}`}
                className={cn(r.ref && "cursor-pointer")}
                onClick={r.ref ? () => openRef(r.ref!) : undefined}
                title={r.ref ? `Open ${formatRef(r.ref)}` : undefined}
              >
                {selection?.selected ? (
                  <TableCell className="px-2 py-1">
                    <Checkbox
                      checked={selection.selected.has(key)}
                      onCheckedChange={() => selection.onToggle?.(key)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${key}`}
                    />
                  </TableCell>
                ) : null}
                {view.columns.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "px-2 py-1",
                      c.align === "right" && "text-right tabular-nums",
                      c.mono && "font-mono",
                    )}
                  >
                    {cellText(r.cells[c.key])}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
});

/* ------------------------------------------------------------ findings --- */

export const FindingsView = memo(function FindingsView({
  view,
  selection,
}: {
  view: Extract<ViewSpec, { kind: "findings" }>;
  selection?: Selection;
}) {
  const items = useMemo(() => [...view.items].sort(bySeverity), [view.items]);
  return (
    <ul className="flex flex-col">
      {items.map((f, i) => {
        const clickable = !!f.ref;
        return (
          <li
            key={`${f.message}-${i}`}
            className="border-t border-border/30 first:border-t-0"
          >
            {/* A real button when the row leads somewhere — keeps the list
                semantics intact and gets keyboard handling for free. */}
            <Row
              as={clickable ? "button" : "div"}
              onClick={clickable ? () => openRef(f.ref!) : undefined}
              title={clickable ? `Open ${formatRef(f.ref!)}` : undefined}
            >
              {selection?.selected ? (
                <Checkbox
                  className="mt-0.5"
                  checked={selection.selected.has(f.message)}
                  onCheckedChange={() => selection.onToggle?.(f.message)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${f.message}`}
                />
              ) : (
                <span
                  className={cn(
                    "mt-[5px] size-1.5 shrink-0 rounded-full",
                    SEVERITY_DOT[f.severity],
                  )}
                />
              )}
              {/* The location goes UNDER the message, never beside it: a full
                path is long enough to squeeze the message into a column two
                words wide in the side dock. */}
              <span className="min-w-0 flex-1">
                <span className="text-foreground">{f.message}</span>
                {f.detail ? (
                  <span className="mt-0.5 block text-muted-foreground/80">
                    {f.detail}
                  </span>
                ) : null}
                {f.ref ? (
                  <span
                    className="mt-0.5 block truncate font-mono text-muted-foreground/70"
                    title={formatRef(f.ref)}
                  >
                    {shortRef(f.ref)}
                  </span>
                ) : null}
              </span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
});

/* ---------------------------------------------------------------- tree --- */

export const TreeView = memo(function TreeView({
  view,
}: {
  view: Extract<ViewSpec, { kind: "tree" }>;
}) {
  return (
    <ul className="flex flex-col py-1">
      {view.nodes.map((n, i) => {
        const clickable = !!n.ref;
        return (
          <li
            key={`${n.label}-${i}`}
            style={{ paddingLeft: `${n.depth * 14}px` }}
          >
            <Row
              as={clickable ? "button" : "div"}
              onClick={clickable ? () => openRef(n.ref!) : undefined}
              title={clickable ? `Open ${formatRef(n.ref!)}` : undefined}
            >
              <HugeiconsIcon
                icon={n.isDir ? Folder01Icon : File01Icon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
              />
              <span
                className={cn(
                  "truncate",
                  n.isDir ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {n.label}
              </span>
              {n.note ? (
                <span className="truncate text-muted-foreground/60">
                  {n.note}
                </span>
              ) : null}
            </Row>
          </li>
        );
      })}
    </ul>
  );
});

/* ------------------------------------------------------------- metrics --- */

export const MetricsView = memo(function MetricsView({
  view,
}: {
  view: Extract<ViewSpec, { kind: "metrics" }>;
}) {
  return (
    // Container queries, not viewport ones: this lives in a narrow side dock,
    // so `sm:` (window width) would wrongly go multi-column in a 380px panel.
    <div className="@container">
      <div className="grid grid-cols-2 gap-px bg-border/40 @md:grid-cols-4">
        {view.items.map((m, i) => (
          <div
            key={`${m.label}-${i}`}
            className="flex flex-col gap-0.5 bg-card px-2.5 py-2"
          >
            <span className="truncate text-xs text-muted-foreground">
              {m.label}
            </span>
            <span
              className={cn(
                "font-medium text-sm tabular-nums",
                m.severity ? SEVERITY_TEXT[m.severity] : "text-foreground",
              )}
            >
              {m.value}
            </span>
            {m.hint ? (
              <span className="truncate text-xs text-muted-foreground/70">
                {m.hint}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
});

/* --------------------------------------------------------------- cards --- */

export const CardsView = memo(function CardsView({
  view,
  selection,
}: {
  view: Extract<ViewSpec, { kind: "cards" }>;
  selection?: Selection;
}) {
  return (
    <div className="@container grid gap-1.5 p-2 @md:grid-cols-2">
      {view.items.map((c, i) => {
        const clickable = !!c.ref;
        return (
          <div
            key={`${c.title}-${i}`}
            className={cn(
              "rounded-md border border-border/60 bg-background px-2.5 py-2 text-xs",
              clickable && "cursor-pointer hover:bg-muted/35",
            )}
            onClick={clickable ? () => openRef(c.ref!) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter") openRef(c.ref!);
                  }
                : undefined
            }
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            {/* Wraps: a long title must push the badge to its own line rather
                than squeeze itself into two crowded words. */}
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              {selection?.selected ? (
                <Checkbox
                  className="mt-0.5"
                  checked={selection.selected.has(c.title)}
                  onCheckedChange={() => selection.onToggle?.(c.title)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${c.title}`}
                />
              ) : null}
              <span className="min-w-[8rem] flex-1 font-medium text-foreground">
                {c.title}
              </span>
              {c.badge ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-px text-xs font-medium",
                    c.severity
                      ? SEVERITY_BADGE[c.severity]
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.badge}
                </span>
              ) : null}
            </div>
            {c.body ? (
              <p className="mt-1 leading-relaxed text-muted-foreground">
                {c.body}
              </p>
            ) : null}
            {c.ref ? (
              <span
                className="mt-1 block truncate font-mono text-muted-foreground/60"
                title={formatRef(c.ref)}
              >
                {shortRef(c.ref)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});

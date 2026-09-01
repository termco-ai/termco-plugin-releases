/**
 * JsonTree — a small collapsible JSON viewer for the trajectory inspector.
 * Deliberately dependency-free (Phase-6 plan: "kleiner JsonTree ohne neue
 * Dependency"): plain recursive React with local open/closed state per node.
 *
 * Collapse policy: objects/arrays up to depth 1 start open, deeper levels
 * start closed; primitive-only leaves render inline. Long strings are
 * truncated with an expand toggle so a 100-kB system prompt cannot lock up
 * the inspector.
 */
import { memo, useState } from "react";

const STRING_PREVIEW = 240;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function Primitive({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  if (typeof value === "string") {
    const long = value.length > STRING_PREVIEW;
    const shown = expanded || !long ? value : `${value.slice(0, STRING_PREVIEW)}…`;
    return (
      <span className="whitespace-pre-wrap break-all text-emerald-600 dark:text-emerald-400">
        &quot;{shown}&quot;
        {long && (
          <button
            type="button"
            className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "less" : `+${value.length - STRING_PREVIEW} chars`}
          </button>
        )}
      </span>
    );
  }
  if (typeof value === "number")
    return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  if (typeof value === "boolean")
    return <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>;
  if (value === null) return <span className="text-muted-foreground">null</span>;
  return <span className="text-muted-foreground">{String(value)}</span>;
}

function summary(value: unknown): string {
  if (Array.isArray(value)) return `[…] ${value.length} items`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `{…} ${keys.length} ${keys.length === 1 ? "key" : "keys"}`;
  }
  return "";
}

function Node({
  name,
  value,
  depth,
}: {
  name: string | null;
  value: unknown;
  depth: number;
}) {
  const container = Array.isArray(value) || isPlainObject(value);
  const [open, setOpen] = useState(depth < 2);

  const label =
    name !== null ? (
      <span className="text-foreground/80">{name}: </span>
    ) : null;

  if (!container) {
    return (
      <div className="pl-3 leading-5">
        {label}
        <Primitive value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, unknown>);

  return (
    <div className="pl-3 leading-5">
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded text-left hover:bg-muted/60"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="inline-block w-2 text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
        {label}
        <span className="text-muted-foreground">{summary(value)}</span>
      </button>
      {open && (
        <div className="border-l border-border/50">
          {entries.length === 0 ? (
            <div className="pl-3 text-muted-foreground">
              {Array.isArray(value) ? "[]" : "{}"}
            </div>
          ) : (
            entries.map(([k, v]) => (
              <Node key={k} name={k} value={v} depth={depth + 1} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export const JsonTree = memo(function JsonTree({ value }: { value: unknown }) {
  return (
    <div className="font-mono text-xs">
      <Node name={null} value={value} depth={0} />
    </div>
  );
});

import type { AiToolPresentationAdapter } from "@termco/ai-tools-base";

type Value = Record<string, unknown>;

const SEVERITIES = new Set(["error", "warning", "info", "success"]);
const ACTION_VARIANTS = new Set(["default", "ghost", "destructive"]);

function record(value: unknown): Value | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Value
    : null;
}

function validOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function validOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function fileRef(value: unknown): Value | null {
  const raw = record(value);
  if (!raw || typeof raw.file !== "string") return null;
  if (
    raw.line !== undefined &&
    (!Number.isInteger(raw.line) || (raw.line as number) < 1)
  ) return null;
  if (
    raw.column !== undefined &&
    (!Number.isInteger(raw.column) || (raw.column as number) < 1)
  ) return null;
  return {
    file: raw.file,
    line: raw.line,
    column: raw.column,
  };
}

function optionalRef(value: unknown): Value | null | undefined {
  return value === undefined ? undefined : fileRef(value);
}

function common(raw: Value): Value | null {
  if (!validOptionalString(raw.title)) return null;
  return { kind: raw.kind, title: raw.title };
}

function tableView(raw: Value): Value | null {
  const base = common(raw);
  if (!base || !Array.isArray(raw.columns) || !Array.isArray(raw.rows)) return null;
  if (raw.columns.length < 1 || raw.columns.length > 8 || raw.rows.length > 200) return null;
  const columns: Value[] = [];
  for (const value of raw.columns) {
    const column = record(value);
    if (!column || !nonEmpty(column.key) || !nonEmpty(column.label)) return null;
    if (column.align !== undefined && column.align !== "left" && column.align !== "right") return null;
    if (!validOptionalBoolean(column.mono)) return null;
    columns.push({
      key: column.key,
      label: column.label,
      align: column.align,
      mono: column.mono,
    });
  }
  const rows: Value[] = [];
  for (const value of raw.rows) {
    const row = record(value);
    const cells = record(row?.cells);
    if (!row || !cells) return null;
    if (!Object.values(cells).every((cell) =>
      typeof cell === "string" ||
      (typeof cell === "number" && Number.isFinite(cell)) ||
      typeof cell === "boolean"
    )) return null;
    const ref = optionalRef(row.ref);
    if (row.ref !== undefined && !ref) return null;
    rows.push({ cells: { ...cells }, ref });
  }
  return { ...base, columns, rows };
}

function chartView(raw: Value): Value | null {
  const base = common(raw);
  if (
    !base ||
    (raw.chart !== "bar" && raw.chart !== "line" && raw.chart !== "area") ||
    !validOptionalString(raw.xLabel) ||
    !validOptionalString(raw.yLabel) ||
    !Array.isArray(raw.series) ||
    raw.series.length < 1 ||
    raw.series.length > 5
  ) return null;
  const series: Value[] = [];
  for (const value of raw.series) {
    const entry = record(value);
    if (
      !entry ||
      !nonEmpty(entry.name) ||
      !Array.isArray(entry.points) ||
      entry.points.length < 1 ||
      entry.points.length > 200
    ) return null;
    const points: Value[] = [];
    for (const pointValue of entry.points) {
      const point = record(pointValue);
      if (
        !point ||
        (typeof point.x !== "string" &&
          (typeof point.x !== "number" || !Number.isFinite(point.x))) ||
        typeof point.y !== "number" ||
        !Number.isFinite(point.y)
      ) return null;
      points.push({ x: point.x, y: point.y });
    }
    series.push({ name: entry.name, points });
  }
  return {
    ...base,
    chart: raw.chart,
    xLabel: raw.xLabel,
    yLabel: raw.yLabel,
    series,
  };
}

function diffView(raw: Value): Value | null {
  const base = common(raw);
  if (
    !base ||
    !validOptionalString(raw.path) ||
    !validOptionalString(raw.patch) ||
    !validOptionalString(raw.before) ||
    !validOptionalString(raw.after)
  ) return null;
  return {
    ...base,
    path: raw.path,
    patch: raw.patch,
    before: raw.before,
    after: raw.after,
  };
}

function findingsView(raw: Value): Value | null {
  const base = common(raw);
  if (!base || !Array.isArray(raw.items) || raw.items.length > 100) return null;
  const items: Value[] = [];
  for (const value of raw.items) {
    const item = record(value);
    if (
      !item ||
      !SEVERITIES.has(String(item.severity)) ||
      !nonEmpty(item.message) ||
      !validOptionalString(item.detail)
    ) return null;
    const ref = optionalRef(item.ref);
    if (item.ref !== undefined && !ref) return null;
    items.push({
      severity: item.severity,
      message: item.message,
      detail: item.detail,
      ref,
    });
  }
  return { ...base, items };
}

function treeView(raw: Value): Value | null {
  const base = common(raw);
  if (!base || !Array.isArray(raw.nodes) || raw.nodes.length > 300) return null;
  const nodes: Value[] = [];
  for (const value of raw.nodes) {
    const node = record(value);
    if (
      !node ||
      !nonEmpty(node.label) ||
      !Number.isInteger(node.depth) ||
      (node.depth as number) < 0 ||
      (node.depth as number) > 8 ||
      !validOptionalBoolean(node.isDir) ||
      !validOptionalString(node.note)
    ) return null;
    const ref = optionalRef(node.ref);
    if (node.ref !== undefined && !ref) return null;
    nodes.push({
      label: node.label,
      depth: node.depth,
      isDir: node.isDir,
      note: node.note,
      ref,
    });
  }
  return { ...base, nodes };
}

function metricsView(raw: Value): Value | null {
  const base = common(raw);
  if (
    !base ||
    !Array.isArray(raw.items) ||
    raw.items.length < 1 ||
    raw.items.length > 8
  ) return null;
  const items: Value[] = [];
  for (const value of raw.items) {
    const item = record(value);
    if (
      !item ||
      !nonEmpty(item.label) ||
      (typeof item.value !== "string" &&
        (typeof item.value !== "number" || !Number.isFinite(item.value))) ||
      !validOptionalString(item.hint) ||
      (item.severity !== undefined && !SEVERITIES.has(String(item.severity)))
    ) return null;
    items.push({
      label: item.label,
      value: item.value,
      hint: item.hint,
      severity: item.severity,
    });
  }
  return { ...base, items };
}

function cardsView(raw: Value): Value | null {
  const base = common(raw);
  if (!base || !Array.isArray(raw.items) || raw.items.length > 30) return null;
  const items: Value[] = [];
  for (const value of raw.items) {
    const item = record(value);
    if (
      !item ||
      !nonEmpty(item.title) ||
      !validOptionalString(item.body) ||
      !validOptionalString(item.badge) ||
      (item.severity !== undefined && !SEVERITIES.has(String(item.severity)))
    ) return null;
    const ref = optionalRef(item.ref);
    if (item.ref !== undefined && !ref) return null;
    items.push({
      title: item.title,
      body: item.body,
      badge: item.badge,
      severity: item.severity,
      ref,
    });
  }
  return { ...base, items };
}

export function parseView(value: unknown): Value | null {
  const raw = record(value);
  if (!raw) return null;
  switch (raw.kind) {
    case "table": return tableView(raw);
    case "chart": return chartView(raw);
    case "diff": return diffView(raw);
    case "findings": return findingsView(raw);
    case "tree": return treeView(raw);
    case "metrics": return metricsView(raw);
    case "cards": return cardsView(raw);
    default: return null;
  }
}

function parseAction(value: unknown): Value | null {
  const raw = record(value);
  if (
    !raw ||
    !nonEmpty(raw.id) ||
    !nonEmpty(raw.label) ||
    !validOptionalString(raw.description) ||
    !validOptionalBoolean(raw.recommended) ||
    (raw.variant !== undefined && !ACTION_VARIANTS.has(String(raw.variant)))
  ) return null;
  return {
    id: raw.id,
    label: raw.label,
    description: raw.description,
    recommended: raw.recommended,
    variant: raw.variant,
  };
}

export function parseShowUiInput(input: unknown): Value | null {
  const raw = record(input);
  const view = parseView(raw?.view);
  return view ? { view } : null;
}

export function parseAskUiInput(input: unknown): Value | null {
  const raw = record(input);
  const view = parseView(raw?.view);
  if (!raw || !view) return null;
  const actions = Array.isArray(raw.actions)
    ? raw.actions.map(parseAction).filter((action): action is Value => !!action)
    : [];
  if (actions.length === 0) return null;
  return {
    view,
    actions,
    question: typeof raw.question === "string" ? raw.question : undefined,
    allowNote: typeof raw.allowNote === "boolean" ? raw.allowNote : undefined,
    selectable: raw.selectable === true,
  };
}

export function parseAskUiOutput(output: unknown): Value | null {
  const raw = record(output);
  if (!raw || typeof raw.label !== "string") return null;
  return {
    actionId: typeof raw.actionId === "string" ? raw.actionId : null,
    label: raw.label,
    note: typeof raw.note === "string" ? raw.note : undefined,
    selected: Array.isArray(raw.selected)
      ? raw.selected.filter((value): value is string => typeof value === "string")
      : undefined,
    dismissed: raw.dismissed === true,
  };
}

export const showUiPresentation: AiToolPresentationAdapter = {
  renderer: "structured-ui",
  interactive: false,
  parseInput: parseShowUiInput,
};

export const askUiPresentation: AiToolPresentationAdapter = {
  renderer: "structured-ui",
  interactive: true,
  parseInput: parseAskUiInput,
  parseOutput: parseAskUiOutput,
};

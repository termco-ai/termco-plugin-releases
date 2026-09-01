export interface RequestFieldChange {
  readonly label: string;
  readonly before: string;
  readonly after: string;
}

export interface RequestDiff {
  readonly changed: boolean;
  readonly fields: readonly RequestFieldChange[];
  readonly tools: {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function display(value: unknown): string {
  if (value === undefined) return "Not set";
  if (typeof value === "string") return value || "Empty";
  if (Array.isArray(value)) return `${value.length} message${value.length === 1 ? "" : "s"}`;
  return canonical(value);
}

function toolName(tool: unknown, index: number): string {
  const object = asObject(tool);
  if (typeof object.name === "string") return object.name;
  const nested = asObject(object.function);
  return typeof nested.name === "string" ? nested.name : `Tool ${index + 1}`;
}

function toolsByName(value: unknown): Map<string, unknown> {
  const tools = Array.isArray(value) ? value : [];
  return new Map(tools.map((tool, index) => [toolName(tool, index), tool]));
}

/** Human-oriented request comparison; raw object ordering is intentionally irrelevant. */
export function diffRequestHeaders(beforeValue: unknown, afterValue: unknown): RequestDiff {
  const before = asObject(beforeValue);
  const after = asObject(afterValue);
  const fields: RequestFieldChange[] = [];
  const definitions = [
    ["Model", "selectedModelId"],
    ["Provider route", "providerRoute"],
    ["Provider model", "providerModelId"],
    ["Reasoning", "reasoningEffort"],
    ["Max output", "maxOutputTokens"],
    ["Temperature", "temperature"],
    ["Instructions", "systemPrompt"],
    ["Messages", "messages"],
    ["Approval policy", "approvalPolicy"],
    ["Provider options", "providerOptions"],
  ] as const;
  for (const [label, key] of definitions) {
    if (canonical(before[key]) === canonical(after[key])) continue;
    fields.push({ label, before: display(before[key]), after: display(after[key]) });
  }

  const beforeTools = toolsByName(before.tools);
  const afterTools = toolsByName(after.tools);
  const added = [...afterTools.keys()].filter((name) => !beforeTools.has(name));
  const removed = [...beforeTools.keys()].filter((name) => !afterTools.has(name));
  const changed = [...beforeTools.keys()].filter((name) =>
    afterTools.has(name) && canonical(beforeTools.get(name)) !== canonical(afterTools.get(name)));
  const tools = Object.freeze({ added: Object.freeze(added), removed: Object.freeze(removed), changed: Object.freeze(changed) });
  return Object.freeze({ changed: fields.length > 0 || added.length > 0 || removed.length > 0 || changed.length > 0, fields: Object.freeze(fields), tools });
}

type JsonSchema = Record<string, unknown>;

const nonEmptyString = { type: "string", minLength: 1 };
const optionalTitle = { type: "string" };
const severity = { type: "string", enum: ["error", "warning", "info", "success"] };
const fileRef: JsonSchema = {
  type: "object",
  properties: {
    file: { type: "string" },
    line: { type: "integer", minimum: 1 },
    column: { type: "integer", minimum: 1 },
  },
  required: ["file"],
  additionalProperties: false,
};

const table: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "table" },
    title: optionalTitle,
    columns: {
      type: "array", minItems: 1, maxItems: 8,
      items: {
        type: "object",
        properties: {
          key: nonEmptyString,
          label: nonEmptyString,
          align: { type: "string", enum: ["left", "right"] },
          mono: { type: "boolean" },
        },
        required: ["key", "label"],
        additionalProperties: false,
      },
    },
    rows: {
      type: "array", maxItems: 200,
      items: {
        type: "object",
        properties: {
          cells: {
            type: "object",
            additionalProperties: {
              anyOf: [
                { type: "string" },
                { type: "number" },
                { type: "boolean" },
              ],
            },
          },
          ref: fileRef,
        },
        required: ["cells"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "columns", "rows"],
  additionalProperties: false,
};

const chart: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "chart" },
    title: optionalTitle,
    chart: { type: "string", enum: ["bar", "line", "area"] },
    xLabel: { type: "string" },
    yLabel: { type: "string" },
    series: {
      type: "array", minItems: 1, maxItems: 5,
      items: {
        type: "object",
        properties: {
          name: nonEmptyString,
          points: {
            type: "array", minItems: 1, maxItems: 200,
            items: {
              type: "object",
              properties: {
                x: { anyOf: [{ type: "string" }, { type: "number" }] },
                y: { type: "number" },
              },
              required: ["x", "y"],
              additionalProperties: false,
            },
          },
        },
        required: ["name", "points"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "chart", "series"],
  additionalProperties: false,
};

const diff: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "diff" },
    title: optionalTitle,
    path: { type: "string" },
    patch: { type: "string" },
    before: { type: "string" },
    after: { type: "string" },
  },
  required: ["kind"],
  additionalProperties: false,
};

const findings: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "findings" },
    title: optionalTitle,
    items: {
      type: "array", maxItems: 100,
      items: {
        type: "object",
        properties: {
          severity,
          message: nonEmptyString,
          detail: { type: "string" },
          ref: fileRef,
        },
        required: ["severity", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "items"],
  additionalProperties: false,
};

const tree: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "tree" },
    title: optionalTitle,
    nodes: {
      type: "array", maxItems: 300,
      items: {
        type: "object",
        properties: {
          label: nonEmptyString,
          depth: { type: "integer", minimum: 0, maximum: 8 },
          isDir: { type: "boolean" },
          note: { type: "string" },
          ref: fileRef,
        },
        required: ["label", "depth"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "nodes"],
  additionalProperties: false,
};

const metrics: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "metrics" },
    title: optionalTitle,
    items: {
      type: "array", minItems: 1, maxItems: 8,
      items: {
        type: "object",
        properties: {
          label: nonEmptyString,
          value: { anyOf: [{ type: "string" }, { type: "number" }] },
          hint: { type: "string" },
          severity,
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "items"],
  additionalProperties: false,
};

const cards: JsonSchema = {
  type: "object",
  properties: {
    kind: { const: "cards" },
    title: optionalTitle,
    items: {
      type: "array", maxItems: 30,
      items: {
        type: "object",
        properties: {
          title: nonEmptyString,
          body: { type: "string" },
          badge: { type: "string" },
          severity,
          ref: fileRef,
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind", "items"],
  additionalProperties: false,
};

export const viewSchema: JsonSchema = {
  anyOf: [table, chart, diff, findings, tree, metrics, cards],
};

export const actionSchema: JsonSchema = {
  type: "object",
  properties: {
    id: nonEmptyString,
    label: nonEmptyString,
    description: { type: "string" },
    recommended: { type: "boolean" },
    variant: { type: "string", enum: ["default", "ghost", "destructive"] },
  },
  required: ["id", "label"],
  additionalProperties: false,
};

export const showUiInputSchema: JsonSchema = {
  type: "object",
  properties: { view: viewSchema },
  required: ["view"],
  additionalProperties: false,
};

export const askUiInputSchema: JsonSchema = {
  type: "object",
  properties: {
    view: viewSchema,
    question: { type: "string" },
    actions: { type: "array", minItems: 1, maxItems: 5, items: actionSchema },
    allowNote: { type: "boolean" },
    selectable: { type: "boolean" },
  },
  required: ["view", "actions"],
  additionalProperties: false,
};

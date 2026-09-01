import { describe, expect, it } from "vitest";
import { createUiToolContribution, createUiTools, viewItemCount } from "./tools";
import {
  parseAskUiInput,
  parseAskUiOutput,
  parseShowUiInput,
} from "./presentation";

const table = {
  kind: "table",
  columns: [{ key: "port", label: "Port" }],
  rows: [{ cells: { port: 5173 } }, { cells: { port: 3000 } }],
};

describe("AI Tools: Rich UI", () => {
  it("publishes one independently replaceable UI tool group", () => {
    expect(createUiToolContribution()).toMatchObject({ id: "ui", group: "ui", order: 170 });
    expect(Object.keys(createUiTools()).sort()).toEqual(["ask_ui", "show_ui"]);
  });

  it("keeps ask_ui interactive and lets show_ui continue", async () => {
    const tools = createUiTools();
    expect(tools.ask_ui?.execute).toBeUndefined();
    await expect(tools.show_ui?.execute?.({ view: table })).resolves.toEqual({
      ok: true,
      kind: "table",
      items: 2,
    });
  });

  it("owns bounded schemas for all seven view kinds", () => {
    const schema = createUiTools().show_ui?.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const variants = properties.view?.anyOf as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(7);
    expect(variants.map((variant) => {
      const fields = variant.properties as Record<string, Record<string, unknown>>;
      return fields.kind?.const;
    })).toEqual(["table", "chart", "diff", "findings", "tree", "metrics", "cards"]);
    const tableFields = variants[0]?.properties as Record<string, Record<string, unknown>>;
    expect(tableFields.rows?.maxItems).toBe(200);
  });

  it("counts the visible records rather than wrapper objects", () => {
    expect(viewItemCount(table)).toBe(2);
    expect(viewItemCount({ kind: "chart", series: [{ points: [1, 2] }, { points: [3] }] })).toBe(3);
    expect(viewItemCount({ kind: "diff" })).toBe(1);
  });

  it("owns rich-card payload validation and normalization", () => {
    expect(parseShowUiInput({ view: table })).toEqual({ view: table });
    expect(parseShowUiInput({
      view: { ...table, rows: [{ cells: { port: null } }] },
    })).toBeNull();
    expect(parseAskUiInput({
      view: table,
      actions: [
        { id: "open", label: "Open", recommended: true },
        { label: "still streaming" },
      ],
      selectable: true,
    })).toMatchObject({
      view: table,
      actions: [{ id: "open", label: "Open", recommended: true }],
      selectable: true,
    });
    expect(parseAskUiOutput({
      actionId: "open",
      label: "Open",
      selected: ["one", 2],
    })).toEqual({
      actionId: "open",
      label: "Open",
      note: undefined,
      selected: ["one"],
      dismissed: false,
    });
  });

  it("publishes both presentation adapters beside the owned schemas", () => {
    const presentations = createUiToolContribution().presentations;
    expect(presentations?.show_ui).toMatchObject({
      renderer: "structured-ui",
      interactive: false,
    });
    expect(presentations?.ask_ui).toMatchObject({
      renderer: "structured-ui",
      interactive: true,
    });
  });
});

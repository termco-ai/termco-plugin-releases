import { describe, expect, it } from "vitest";
import { applyMinimalEdit } from "./editor/lib/format";

describe("editor surface ownership", () => {
  it("owns its minimal formatting edit behavior", () => {
    let change: unknown;
    const view = {
      state: { doc: { toString: () => "hello world" } },
      dispatch(value: unknown) { change = value; },
    };
    expect(applyMinimalEdit(view as never, "hello plugin")).toBe(true);
    expect(change).toEqual({ changes: { from: 6, to: 11, insert: "plugin" } });
  });
});

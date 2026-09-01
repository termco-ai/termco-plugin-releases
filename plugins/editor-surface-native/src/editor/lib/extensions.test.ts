import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  buildSharedExtensions,
  languageCompartment,
  readOnlyCompartment,
  vimCompartment,
  wrapCompartment,
} from "./extensions";

describe("compartments", () => {
  it("exports four distinct compartments", () => {
    const all = [
      languageCompartment,
      readOnlyCompartment,
      wrapCompartment,
      vimCompartment,
    ];
    for (const c of all) expect(c).toBeInstanceOf(Compartment);
    expect(new Set(all).size).toBe(4);
  });

  it("supports runtime reconfiguration without rebuilding state", () => {
    const state = EditorState.create({
      extensions: [languageCompartment.of([])],
    });
    const next = state.update({
      effects: languageCompartment.reconfigure(EditorState.tabSize.of(8)),
    }).state;
    expect(next.tabSize).toBe(8);
  });
});

describe("buildSharedExtensions", () => {
  it("configures a two-space indent unit and tab size", () => {
    const state = EditorState.create({
      extensions: buildSharedExtensions(),
    });
    expect(state.facet(indentUnit)).toBe("  ");
    expect(state.tabSize).toBe(2);
  });

  it("returns a fresh array per call", () => {
    expect(buildSharedExtensions()).not.toBe(buildSharedExtensions());
  });
});

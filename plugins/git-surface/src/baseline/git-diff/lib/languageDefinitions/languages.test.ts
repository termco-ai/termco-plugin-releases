import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./languages";

describe("LANGUAGES", () => {
  it("declares a name and at least one extension per language", () => {
    for (const lang of LANGUAGES) {
      expect(lang.name).toBeTruthy();
      expect(lang.extensions.length).toBeGreaterThan(0);
    }
  });

  it("never declares the same extension twice", () => {
    const seen = new Set<string>();
    for (const lang of LANGUAGES) {
      for (const ext of lang.extensions) {
        expect(seen.has(ext), `duplicate extension ${ext}`).toBe(false);
        seen.add(ext);
      }
    }
  });

  it("every loader resolves to a usable CodeMirror extension", async () => {
    for (const lang of LANGUAGES) {
      const ext = await lang.loader();
      expect(ext, `loader for ${lang.name} returned nothing`).toBeTruthy();
      expect(
        () => EditorState.create({ doc: "test", extensions: ext }),
        `extension for ${lang.name} is not accepted by EditorState`,
      ).not.toThrow();
    }
  }, 30_000);
});

import { describe, expect, it } from "vitest";
import { LANGUAGES } from "./languages";
import {
  ALL_LANGUAGES,
  EXPOSED_LANGUAGES,
  extensionMap,
  filenameMap,
} from "./tables";

describe("ALL_LANGUAGES", () => {
  it("contains every language, alphabetised by name", () => {
    expect(ALL_LANGUAGES).toHaveLength(LANGUAGES.length);
    const names = ALL_LANGUAGES.map((l) => l.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("uses the primary extension for each entry", () => {
    const ts = ALL_LANGUAGES.find((l) => l.name === "TypeScript");
    expect(ts?.ext).toBe("ts");
  });
});

describe("EXPOSED_LANGUAGES", () => {
  it("contains only user-selectable languages", () => {
    const selectable = LANGUAGES.filter((l) => l.userSelectable);
    expect(EXPOSED_LANGUAGES).toHaveLength(selectable.length);
    expect(EXPOSED_LANGUAGES.length).toBeLessThan(LANGUAGES.length);
  });
});

describe("extensionMap", () => {
  it("maps every declared extension in lower case", () => {
    for (const lang of LANGUAGES) {
      for (const ext of lang.extensions) {
        expect(extensionMap.get(ext.toLowerCase())).toBe(lang);
      }
    }
  });

  it("resolves common extensions", () => {
    expect(extensionMap.get("ts")?.name).toBe("TypeScript");
    expect(extensionMap.get("rs")?.name).toBe("Rust");
    expect(extensionMap.get("py")?.name).toBe("Python");
  });
});

describe("filenameMap", () => {
  it("maps declared filenames in lower case", () => {
    for (const lang of LANGUAGES) {
      for (const file of lang.filenames ?? []) {
        expect(filenameMap.get(file.toLowerCase())).toBe(lang);
      }
    }
  });

  it("resolves well-known filenames", () => {
    expect(filenameMap.get("dockerfile")?.name).toBe("Dockerfile");
    expect(filenameMap.get(".eslintrc")?.name).toBe("JSON");
  });
});

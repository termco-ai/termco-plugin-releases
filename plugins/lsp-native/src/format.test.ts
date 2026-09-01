import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyTextEdits,
  detectFormatterLocal,
  resolveProjectBinLocal,
} from "./format";

let tmp: string;

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "termco-fmt-"));
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("detectFormatterLocal", () => {
  it("nearest config wins over an outer one", () => {
    const root = join(tmp, "near");
    const pkg = join(root, "packages", "web");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(root, ".prettierrc"), "{}");
    writeFileSync(join(pkg, "biome.json"), "{}");
    const file = join(pkg, "a.ts");
    writeFileSync(file, "");
    expect(detectFormatterLocal(file, root)?.spec.kind).toBe("biome");
    // A file outside the package sees only the outer prettier config.
    const outer = join(root, "b.ts");
    writeFileSync(outer, "");
    expect(detectFormatterLocal(outer, root)?.spec.kind).toBe("prettier");
  });

  it("biome beats prettier on a same-directory tie", () => {
    const root = join(tmp, "tie");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "biome.json"), "{}");
    writeFileSync(join(root, ".prettierrc"), "{}");
    const file = join(root, "a.ts");
    writeFileSync(file, "");
    expect(detectFormatterLocal(file, root)?.spec.kind).toBe("biome");
  });

  it("returns null without any config", () => {
    const root = join(tmp, "none");
    mkdirSync(root, { recursive: true });
    const file = join(root, "a.ts");
    writeFileSync(file, "");
    expect(detectFormatterLocal(file, root)).toBeNull();
  });
});

describe("python + presence-based detection", () => {
  it("detects ruff via ruff.toml and via [tool.ruff] in pyproject", () => {
    const a = join(tmp, "py-ruff");
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, "ruff.toml"), "");
    writeFileSync(join(a, "main.py"), "");
    expect(detectFormatterLocal(join(a, "main.py"), a)?.spec.kind).toBe("ruff");

    const b = join(tmp, "py-pyproject");
    mkdirSync(b, { recursive: true });
    writeFileSync(join(b, "pyproject.toml"), "[tool.ruff]\nline-length = 100\n");
    writeFileSync(join(b, "main.py"), "");
    expect(detectFormatterLocal(join(b, "main.py"), b)?.spec.kind).toBe("ruff");
  });

  it("detects black via [tool.black]; pyproject without either matches none", () => {
    const a = join(tmp, "py-black");
    mkdirSync(a, { recursive: true });
    writeFileSync(join(a, "pyproject.toml"), "[tool.black]\n");
    writeFileSync(join(a, "main.py"), "");
    expect(detectFormatterLocal(join(a, "main.py"), a)?.spec.kind).toBe("black");

    const b = join(tmp, "py-none");
    mkdirSync(b, { recursive: true });
    writeFileSync(join(b, "pyproject.toml"), "[tool.poetry]\n");
    writeFileSync(join(b, "main.py"), "");
    expect(detectFormatterLocal(join(b, "main.py"), b)).toBeNull();
  });

  it("finds project venv binaries for presence-based defaults", () => {
    const root = join(tmp, "venvproj");
    mkdirSync(join(root, ".venv", "bin"), { recursive: true });
    writeFileSync(join(root, ".venv", "bin", "ruff"), "#!/bin/sh\n");
    const file = join(root, "app.py");
    writeFileSync(file, "");
    expect(resolveProjectBinLocal(file, "ruff", root)).toBe(
      join(root, ".venv", "bin", "ruff"),
    );
  });
});

describe("resolveProjectBinLocal", () => {
  it("finds the nearest node_modules/.bin binary", () => {
    const root = join(tmp, "bins");
    const pkg = join(root, "app");
    mkdirSync(join(root, "node_modules", ".bin"), { recursive: true });
    mkdirSync(join(pkg, "node_modules", ".bin"), { recursive: true });
    writeFileSync(join(root, "node_modules", ".bin", "prettier"), "#!/bin/sh\n");
    writeFileSync(join(pkg, "node_modules", ".bin", "prettier"), "#!/bin/sh\n");
    const file = join(pkg, "a.ts");
    writeFileSync(file, "");
    expect(resolveProjectBinLocal(file, "prettier", root)).toBe(
      join(pkg, "node_modules", ".bin", "prettier"),
    );
    expect(resolveProjectBinLocal(file, "missing-tool", root)).toBeNull();
  });
});

describe("applyTextEdits", () => {
  it("applies multiple edits bottom-up so offsets stay valid", () => {
    const text = "aaa\nbbb\nccc\n";
    const edits = [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
        newText: "AAAA",
      },
      {
        range: { start: { line: 2, character: 1 }, end: { line: 2, character: 3 } },
        newText: "X",
      },
    ];
    expect(applyTextEdits(text, edits)).toBe("AAAA\nbbb\ncX\n");
  });

  it("handles a whole-document replacement edit", () => {
    const edits = [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 9999, character: 0 } },
        newText: "new\n",
      },
    ];
    expect(applyTextEdits("old\ncontent\n", edits)).toBe("new\n");
  });
});

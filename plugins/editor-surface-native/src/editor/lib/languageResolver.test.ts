import { describe, expect, it } from "vitest";
import {
  preloadLanguages,
  resolveDisplayName,
  resolveLanguage,
  resolveLanguageSync,
} from "./languageResolver";

describe("resolveDisplayName", () => {
  it("resolves real extensions", () => {
    expect(resolveDisplayName("App.tsx")).toBe("TypeScript React");
    expect(resolveDisplayName("main.go")).toBe("Go");
    expect(resolveDisplayName("README.md")).toBe("Markdown");
    expect(resolveDisplayName("query.sql")).toBe("SQL");
  });

  it("strips directories before resolving", () => {
    expect(resolveDisplayName("/Users/foo/src/index.ts")).toBe("TypeScript");
    expect(resolveDisplayName("C:\\proj\\Dockerfile.prod")).toBe("Dockerfile");
  });

  it("matches fixed filenames", () => {
    expect(resolveDisplayName("Dockerfile")).toBe("Dockerfile");
    expect(resolveDisplayName(".env")).toBe("Properties");
    expect(resolveDisplayName(".eslintrc")).toBe("JSON");
  });

  // Regression: removing isDockerfileLike dropped highlighting for Dockerfile
  // variants. The name-scoped prefix fallback restores it generically.
  it("resolves filename-prefix variants of name-based languages", () => {
    expect(resolveDisplayName("Dockerfile.web")).toBe("Dockerfile");
    expect(resolveDisplayName("Dockerfile.dev")).toBe("Dockerfile");
    expect(resolveDisplayName("web.dockerfile")).toBe("Dockerfile");
  });

  // The prefix fallback must not let extension languages capture lookalike
  // files: `go.sum` / `go.mod` are not Go, `json.backup` is not JSON.
  it("does not let extension languages capture prefix lookalikes", () => {
    expect(resolveDisplayName("go.sum")).not.toBe("Go");
    expect(resolveDisplayName("go.mod")).not.toBe("Go");
    expect(resolveDisplayName("json.backup")).not.toBe("JSON");
  });

  it("falls back to a capitalized basename for unknown files", () => {
    expect(resolveDisplayName("notes")).toBe("Notes");
    expect(resolveDisplayName(null)).toBe("Plain Text");
    expect(resolveDisplayName("")).toBe("Plain Text");
  });
});

describe("resolveLanguage", () => {
  it("loads a language extension for a known extension", async () => {
    const result = await resolveLanguage("src/main.ts");
    expect(result?.name).toBe("TypeScript");
    expect(result?.id).toBe("ts");
    expect(result?.ext).toBeTruthy();
  });

  it("returns null for unknown extensions and caches the miss", async () => {
    expect(await resolveLanguage("file.unknownext")).toBeNull();
    expect(resolveLanguageSync("file.unknownext")).toBeNull();
    expect(await resolveLanguage("other.unknownext")).toBeNull();
  });

  it("returns the same cached result for equivalent files", async () => {
    const a = await resolveLanguage("a.ts");
    const b = await resolveLanguage("deep/dir/b.ts");
    expect(a).toBe(b);
  });
});

describe("resolveLanguageSync", () => {
  it("returns null before the language was loaded", () => {
    expect(resolveLanguageSync("never-loaded.zig")).toBeNull();
  });

  it("returns the cached result after an async resolve", async () => {
    const loaded = await resolveLanguage("mod.rs");
    expect(resolveLanguageSync("src/mod.rs")).toBe(loaded);
  });
});

describe("preloadLanguages", () => {
  it("warms the cache without throwing", async () => {
    preloadLanguages(["warm.py", "warm.unknownext"]);
    await new Promise((r) => setTimeout(r, 0));
    await expect(resolveLanguage("warm.py")).resolves.toMatchObject({
      name: "Python",
    });
  });
});

import type { Tab } from "../../types";
import { describe, expect, it } from "vitest";
import { subtitleFor } from "./subtitleFor";

function term(cwd?: string): Tab {
  return {
    id: 1,
    kind: "terminal",
    rigId: "s1",
    title: "shell",
    label: "shell",
    dirty: false,
    preview: false,
    private: false,
    cwd,
  };
}

function editor(path: string): Tab {
  return {
    id: 3,
    kind: "editor",
    rigId: "s1",
    title: "x",
    label: "x",
    path,
    dirty: false,
    preview: false,
    private: false,
  };
}

describe("subtitleFor", () => {
  it("shows the last two cwd segments for a terminal", () => {
    expect(subtitleFor(term("/Users/me/projects/termco-ai"))).toBe(
      "projects/termco-ai",
    );
  });

  it("handles windows separators", () => {
    expect(subtitleFor(term("C:\\Users\\me\\proj"))).toBe("me/proj");
  });

  it("returns null for a terminal without cwd", () => {
    expect(subtitleFor(term(undefined))).toBeNull();
  });

  it("falls back to the raw cwd when it has no segments", () => {
    expect(subtitleFor(term("/"))).toBe("/");
  });

  it("shows the parent folder for editor and markdown tabs", () => {
    expect(subtitleFor(editor("/a/src/foo.ts"))).toBe("src");
    expect(
      subtitleFor({
        id: 4,
        kind: "markdown",
        rigId: "s1",
        title: "README.md",
        label: "README.md",
        path: "/repo/docs/README.md",
        dirty: false,
        preview: false,
        private: false,
      }),
    ).toBe("docs");
  });

  it("returns null when the file has no parent folder", () => {
    expect(subtitleFor(editor("foo.ts"))).toBeNull();
  });

  it("returns null for other tab kinds", () => {
    expect(
      subtitleFor({
        id: 5,
        kind: "preview",
        rigId: "s1",
        title: "localhost",
        label: "localhost",
        dirty: false,
        preview: false,
        private: false,
      }),
    ).toBeNull();
  });
});

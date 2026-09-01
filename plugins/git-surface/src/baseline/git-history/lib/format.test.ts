import { describe, expect, it } from "vitest";
import {
  absoluteTime,
  authorInitials,
  authorTint,
  basename,
  compactDate,
  dirname,
  normalizeError,
  statusTone,
} from "./format";

describe("basename", () => {
  it("returns the last segment of a unix path", () => {
    expect(basename("src/modules/git/file.ts")).toBe("file.ts");
  });

  it("handles windows separators and trailing slashes", () => {
    expect(basename("C:\\Users\\dev\\file.ts")).toBe("file.ts");
    expect(basename("src/dir/")).toBe("dir");
  });

  it("returns the input when there are no segments", () => {
    expect(basename("")).toBe("");
    expect(basename("///")).toBe("///");
  });
});

describe("dirname", () => {
  it("returns the directory portion", () => {
    expect(dirname("src/modules/file.ts")).toBe("src/modules");
  });

  it("normalizes backslashes", () => {
    expect(dirname("src\\modules\\file.ts")).toBe("src/modules");
  });

  it("returns empty for top-level files", () => {
    expect(dirname("file.ts")).toBe("");
    expect(dirname("/file.ts")).toBe("");
  });
});

describe("normalizeError", () => {
  it("passes strings through", () => {
    expect(normalizeError("boom")).toBe("boom");
  });

  it("extracts string messages from error-like objects", () => {
    expect(normalizeError(new Error("bad"))).toBe("bad");
    expect(normalizeError({ message: "custom" })).toBe("custom");
  });

  it("falls back for everything else", () => {
    expect(normalizeError({ message: 42 })).toBe("Unknown error");
    expect(normalizeError(null)).toBe("Unknown error");
    expect(normalizeError(7)).toBe("Unknown error");
  });
});

describe("absoluteTime", () => {
  it("returns empty for a zero timestamp", () => {
    expect(absoluteTime(0)).toBe("");
  });

  it("formats a timestamp with date and time parts", () => {
    const secs = Math.floor(new Date(2023, 2, 14, 15, 9).getTime() / 1000);
    const out = absoluteTime(secs);
    expect(out).toContain("2023");
    expect(out).toContain("14");
    expect(out.length).toBeGreaterThan(8);
  });
});

describe("authorInitials", () => {
  it("uses first and last name initials", () => {
    expect(authorInitials("Ada Lovelace")).toBe("AL");
    expect(authorInitials("Ada Byron Lovelace")).toBe("AL");
  });

  it("uses a single initial for one-word names", () => {
    expect(authorInitials("ada")).toBe("A");
  });

  it("falls back to ? for blank names", () => {
    expect(authorInitials("")).toBe("?");
    expect(authorInitials("   ")).toBe("?");
  });
});

describe("authorTint", () => {
  it("is deterministic per key", () => {
    expect(authorTint("a@x.com")).toBe(authorTint("a@x.com"));
  });

  it("always returns a hex color from the palette", () => {
    for (const key of ["", "a", "someone@example.com", "Z".repeat(100)]) {
      expect(authorTint(key)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("distinguishes at least some authors", () => {
    const tints = new Set(
      ["a@x.com", "b@x.com", "c@x.com", "d@x.com", "e@x.com"].map(authorTint),
    );
    expect(tints.size).toBeGreaterThan(1);
  });
});

describe("compactDate", () => {
  it("returns empty for a zero timestamp", () => {
    expect(compactDate(0)).toBe("");
  });

  it("shows time with a double rig for dates in the current year", () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), 5, 15, 9, 5);
    const secs = Math.floor(d.getTime() / 1000);
    expect(compactDate(secs)).toMatch(/^\S+ 15 {2}09:05$/);
  });

  it("shows the year instead of the time for other years", () => {
    const d = new Date(2019, 5, 5, 9, 5);
    const secs = Math.floor(d.getTime() / 1000);
    expect(compactDate(secs)).toMatch(/^\S+ 05 2019$/);
  });
});

describe("statusTone", () => {
  it("maps each git status code to its tone", () => {
    expect(statusTone("A")).toContain("emerald");
    expect(statusTone("M")).toContain("amber");
    expect(statusTone("D")).toContain("rose");
    expect(statusTone("R")).toContain("sky");
    expect(statusTone("C")).toContain("sky");
  });

  it("is case-insensitive", () => {
    expect(statusTone("a")).toBe(statusTone("A"));
  });

  it("falls back to muted for unknown codes", () => {
    expect(statusTone("X")).toBe("text-muted-foreground");
    expect(statusTone("")).toBe("text-muted-foreground");
  });
});

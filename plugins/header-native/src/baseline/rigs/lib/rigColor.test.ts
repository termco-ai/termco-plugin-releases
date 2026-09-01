import { describe, expect, it } from "vitest";
import { accentFor, SPACE_COLORS, rigInitial } from "./rigColor";

describe("accentFor", () => {
  it("returns the indexed palette color", () => {
    expect(accentFor({ color: 0 })).toBe(SPACE_COLORS[0]);
    expect(accentFor({ color: SPACE_COLORS.length - 1 })).toBe(
      SPACE_COLORS[SPACE_COLORS.length - 1],
    );
  });

  it("falls back to the theme primary when unset", () => {
    expect(accentFor({})).toBe("var(--primary)");
    expect(accentFor({ color: undefined })).toBe("var(--primary)");
  });

  it("falls back to the theme primary for out-of-range indices", () => {
    expect(accentFor({ color: -1 })).toBe("var(--primary)");
    expect(accentFor({ color: SPACE_COLORS.length })).toBe("var(--primary)");
  });
});

describe("rigInitial", () => {
  it("returns the uppercased first character", () => {
    expect(rigInitial("work")).toBe("W");
    expect(rigInitial("Termco")).toBe("T");
  });

  it("ignores leading whitespace", () => {
    expect(rigInitial("  dev")).toBe("D");
  });

  it("returns ? for empty or whitespace-only names", () => {
    expect(rigInitial("")).toBe("?");
    expect(rigInitial("   ")).toBe("?");
  });
});

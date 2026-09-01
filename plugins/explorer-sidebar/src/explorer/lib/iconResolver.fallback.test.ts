/**
 * Covers iconResolver fall-through branches that the shipped icon data never
 * reaches (mapped names whose icon is missing from the iconify set) by
 * mocking the lookup tables.
 */
import { describe, expect, it, vi } from "vitest";
import { fileIconUrl, folderIconUrl } from "./iconResolver";

vi.mock("./fileIcons", () => ({
  fileNames: { "ghosted.name": "no-such-icon" },
  fileExtensions: { brokenext: "no-such-icon" },
}));

vi.mock("./folderIcons", () => ({
  folderNames: { brokendir: "no-such-icon" },
}));

const DEFAULT_FILE = fileIconUrl("nothing-matches-me");
const DEFAULT_FOLDER = folderIconUrl("nothing-matches-me", false);

describe("fileIconUrl fallbacks", () => {
  it("falls through to the default when the name icon is missing", () => {
    expect(fileIconUrl("ghosted.name")).toBe(DEFAULT_FILE);
    // Second call exercises the negative cache.
    expect(fileIconUrl("ghosted.name")).toBe(DEFAULT_FILE);
  });

  it("falls through to the default when the ext icon is missing", () => {
    expect(fileIconUrl("x.brokenext")).toBe(DEFAULT_FILE);
  });
});

describe("folderIconUrl fallbacks", () => {
  it("falls back to the default folder when the mapped icon is missing", () => {
    expect(folderIconUrl("brokendir", false)).toBe(DEFAULT_FOLDER);
  });
});

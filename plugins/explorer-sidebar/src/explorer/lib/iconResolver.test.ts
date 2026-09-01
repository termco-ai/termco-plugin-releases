import { icons as catppuccinIcons } from "@iconify-json/catppuccin";
import { describe, expect, it } from "vitest";
import { fileExtensions, fileNames } from "./fileIcons";
import { folderNames } from "./folderIcons";
import { fileIconUrl, folderIconUrl } from "./iconResolver";

const SVG_PREFIX = "data:image/svg+xml;utf8,";

function decode(url: string): string {
  expect(url.startsWith(SVG_PREFIX)).toBe(true);
  return decodeURIComponent(url.slice(SVG_PREFIX.length));
}

describe("fileIconUrl", () => {
  it("resolves a known file name before any extension", () => {
    const url = fileIconUrl("package.json");
    expect(decode(url)).toContain("<svg");
    expect(url).not.toBe(fileIconUrl("unknown.json"));
  });

  it("is case-insensitive on the file name", () => {
    expect(fileIconUrl("PACKAGE.JSON")).toBe(fileIconUrl("package.json"));
  });

  it("resolves by extension", () => {
    const url = fileIconUrl("main.rs");
    expect(decode(url)).toContain("<svg");
    expect(url).not.toBe(fileIconUrl("no-extension"));
  });

  it("resolves common source extensions", () => {
    const ts = fileIconUrl("foo.ts");
    expect(decode(ts)).toContain("<svg");
    expect(ts).not.toBe(fileIconUrl("no-extension"));
  });

  it("walks compound extensions down to the last segment", () => {
    expect(fileIconUrl("foo.unknownpart.ts")).toBe(fileIconUrl("foo.ts"));
  });

  it("returns the default file icon for unknown names", () => {
    const fallback = fileIconUrl("no-extension");
    expect(decode(fallback)).toContain("<svg");
    expect(fileIconUrl("mystery.zzzunknownext")).toBe(fallback);
  });

  it("treats a trailing dot as no extension", () => {
    expect(fileIconUrl("weird.")).toBe(fileIconUrl("no-extension"));
  });

  it("caches data urls across calls", () => {
    expect(fileIconUrl("a.rs")).toBe(fileIconUrl("b.rs"));
  });
});

describe("icon data invariants", () => {
  // The resolver looks icons up directly in `icons` and does not resolve
  // iconify aliases. This locks that a catppuccin icon-set update cannot
  // silently move a shipped icon behind an alias and degrade it to the
  // default icon.
  it("every shipped icon name resolves directly in the iconify set", () => {
    const icons = (catppuccinIcons as { icons: Record<string, unknown> }).icons;
    const shipped = new Set<string>([
      ...Object.values(fileNames as Record<string, string>),
      ...Object.values(fileExtensions as Record<string, string>),
      ...Object.values(folderNames as Record<string, string>),
    ]);
    for (const name of shipped) {
      const slug = name.replace(/_/g, "-");
      expect(icons[slug], `icon ${name} (${slug}) missing`).toBeDefined();
    }
  });
});

describe("folderIconUrl", () => {
  it("resolves a known folder name", () => {
    const src = folderIconUrl("src", false);
    expect(decode(src)).toContain("<svg");
    expect(src).not.toBe(folderIconUrl("totally-unknown-folder", false));
  });

  it("returns the open variant when expanded", () => {
    expect(folderIconUrl("src", true)).not.toBe(folderIconUrl("src", false));
  });

  it("is case-insensitive on the folder name", () => {
    expect(folderIconUrl("SRC", false)).toBe(folderIconUrl("src", false));
  });

  it("falls back to generic folder icons for unknown names", () => {
    const closed = folderIconUrl("totally-unknown-folder", false);
    const open = folderIconUrl("totally-unknown-folder", true);
    expect(decode(closed)).toContain("<svg");
    expect(decode(open)).toContain("<svg");
    expect(closed).not.toBe(open);
  });
});

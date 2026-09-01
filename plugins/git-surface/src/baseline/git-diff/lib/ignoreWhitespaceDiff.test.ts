import { describe, expect, it } from "vitest";
import { ignoreWhitespaceDiff } from "./ignoreWhitespaceDiff";

/** Lines touched on the new side, which is what the viewer paints green. */
function changedLinesB(a: string, b: string): number {
  const changes = ignoreWhitespaceDiff(a, b);
  const lines = new Set<number>();
  for (const ch of changes) {
    const from = b.slice(0, ch.fromB).split("\n").length - 1;
    const to = b.slice(0, ch.toB).split("\n").length - 1;
    for (let i = from; i <= to; i++) lines.add(i);
  }
  return lines.size;
}

describe("ignoreWhitespaceDiff", () => {
  it("sees nothing in a pure re-indent", () => {
    const a = "<div>\n  <p>hi</p>\n</div>\n";
    const b = "    <div>\n      <p>hi</p>\n    </div>\n";
    expect(ignoreWhitespaceDiff(a, b)).toEqual([]);
  });

  it("ignores trailing whitespace too", () => {
    expect(ignoreWhitespaceDiff("const a = 1;\n", "const a = 1;   \n")).toEqual([]);
  });

  // The two sides can come from different machines; a line-ending difference is
  // not an edit anyone wants to look at.
  it("ignores a CRLF/LF difference", () => {
    expect(ignoreWhitespaceDiff("a\nb\nc\n", "a\r\nb\r\nc\r\n")).toEqual([]);
  });

  it("still reports a real edit", () => {
    const changes = ignoreWhitespaceDiff("const a = 1;\n", "const a = 2;\n");
    expect(changes.length).toBeGreaterThan(0);
  });

  it("reports an edit that is also re-indented", () => {
    const changes = ignoreWhitespaceDiff("const a = 1;\n", "    const a = 2;\n");
    expect(changes.length).toBeGreaterThan(0);
  });

  it("puts the change where it belongs in the original text", () => {
    const a = "keep\nconst a = 1;\nkeep\n";
    const b = "keep\n    const a = 2;\nkeep\n";
    const [ch] = ignoreWhitespaceDiff(a, b);
    // The edit is on line 2 — not at the top of the file.
    expect(a.slice(ch.fromA, ch.toA)).toContain("1");
    expect(b.slice(ch.fromB, ch.toB)).toContain("2");
    expect(a.slice(0, ch.fromA)).toContain("keep");
  });

  /**
   * The case from the user's screenshot, and the whole reason this exists:
   * a block moved into a new wrapper, so fifteen lines shifted by four spaces
   * while four lines were genuinely added. Nineteen lines used to light up.
   */
  it("marks only what actually changed when a block is wrapped", () => {
    const inner = [
      '<div class="tw-flex tw-flex-row tw-gap-x-8">',
      "  @for (tile of tiles(); track tile.link) {",
      "    <a",
      '      [routerLink]="tile.link"',
      '      class="tw-flex tw-h-64 tw-w-96">',
      '      <div class="tw-h-16 tw-w-16"></div>',
      '      <div class="text-primary">',
      "        {{ tile.titleKey | translate }}",
      "      </div>",
      '      <div class="text-grey">',
      "        {{ tile.subtitleKey | translate }}",
      "      </div>",
      "    </a>",
      "  }",
      "</div>",
    ];
    const a = `${inner.join("\n")}\n`;
    const b = [
      '<div class="tw-flex tw-flex-col">',
      '  <p class="text-primary">',
      "    nice to have u here!",
      "  </p>",
      "",
      ...inner.map((l) => `  ${l}`),
      "</div>",
      "",
    ].join("\n");

    // Four new lines plus the wrapper's own two — nowhere near nineteen.
    expect(changedLinesB(a, b)).toBeLessThanOrEqual(8);
  });

  it("handles empty and single-line inputs", () => {
    expect(ignoreWhitespaceDiff("", "")).toEqual([]);
    expect(ignoreWhitespaceDiff("", "new\n").length).toBeGreaterThan(0);
    expect(ignoreWhitespaceDiff("gone\n", "").length).toBeGreaterThan(0);
    expect(ignoreWhitespaceDiff("one", "one")).toEqual([]);
  });

  it("handles a file with no trailing newline", () => {
    expect(ignoreWhitespaceDiff("a\nb", "  a\n  b")).toEqual([]);
    expect(ignoreWhitespaceDiff("a\nb", "a\nc").length).toBeGreaterThan(0);
  });

  it("never produces a range outside its text", () => {
    const a = "alpha\n  beta\ngamma\n";
    const b = "alpha\nBETA\n   gamma\n";
    for (const ch of ignoreWhitespaceDiff(a, b)) {
      expect(ch.fromA).toBeGreaterThanOrEqual(0);
      expect(ch.toA).toBeLessThanOrEqual(a.length);
      expect(ch.fromB).toBeGreaterThanOrEqual(0);
      expect(ch.toB).toBeLessThanOrEqual(b.length);
      expect(ch.toA).toBeGreaterThanOrEqual(ch.fromA);
      expect(ch.toB).toBeGreaterThanOrEqual(ch.fromB);
    }
  });
});

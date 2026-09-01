// Kept with the source-owning terminal plugin.
import { describe, expect, it } from "vitest";
import { isLongFormat, parseLsLong, wantsHidden } from "./lsLong";

const NAMES = [
  "src",
  "package.json",
  "README.md",
  "my file.txt",
  "link",
  "Bildschirmfoto 2026-07-02 um 21.21.54.png",
];

describe("flag detection", () => {
  it("detects long format in combined flags", () => {
    expect(isLongFormat("ls -la")).toBe(true);
    expect(isLongFormat("ls -ltr src")).toBe(true);
    expect(isLongFormat("ls")).toBe(false);
    expect(isLongFormat("ls -a")).toBe(false);
  });

  it("detects hidden-files flags", () => {
    expect(wantsHidden("ls -la")).toBe(true);
    expect(wantsHidden("ls -A")).toBe(true);
    expect(wantsHidden("ls -l")).toBe(false);
  });
});

describe("parseLsLong", () => {
  it("parses BSD long output, skipping the total line", () => {
    const out = [
      "total 24",
      "drwxr-xr-x  12 kevin  staff   384  2 Jul 20:15 src",
      "-rw-r--r--@  1 kevin  staff  4821  2 Jul 19:03 package.json",
      "-rw-r--r--   1 kevin  staff  1102 30 Jun 09:41 README.md",
    ].join("\n");
    const rows = parseLsLong(out, NAMES);
    expect(rows).toHaveLength(3);
    expect(rows?.[0]).toMatchObject({
      perms: "drwxr-xr-x",
      name: "src",
      verified: true,
    });
    expect(rows?.[0].meta).toBe("12 kevin staff 384 2 Jul 20:15");
    expect(rows?.[1].perms).toBe("-rw-r--r--@");
  });

  it("handles names with spaces via known-name suffix matching", () => {
    const out = "-rw-r--r--  1 kevin staff  9 2 Jul 20:00 my file.txt";
    const rows = parseLsLong(out, NAMES);
    expect(rows?.[0]).toMatchObject({ name: "my file.txt", verified: true });
    expect(rows?.[0].meta).toBe("1 kevin staff 9 2 Jul 20:00");
  });

  it("parses symlinks with targets", () => {
    const out = "lrwxr-xr-x  1 kevin staff  8 2 Jul 20:00 link -> src/main";
    const rows = parseLsLong(out, NAMES);
    expect(rows?.[0]).toMatchObject({
      name: "link",
      linkTarget: "src/main",
      verified: true,
    });
  });

  it("drops . and .. entries", () => {
    const out = [
      "drwxr-xr-x  5 kevin staff 160 2 Jul 20:00 .",
      "drwxr-xr-x 30 kevin staff 960 2 Jul 20:00 ..",
      "drwxr-xr-x 12 kevin staff 384 2 Jul 20:00 src",
    ].join("\n");
    const rows = parseLsLong(out, NAMES);
    expect(rows?.map((r) => r.name)).toEqual(["src"]);
  });

  it("re-joins a name wrapped across two buffer rows", () => {
    const out = [
      "-rw-r--r--  1 kevin staff  120396 2 Jul 21:21 Bildschirmfoto 2026-07-",
      "02 um 21.21.54.png",
    ].join("\n");
    const rows = parseLsLong(out, NAMES);
    expect(rows?.[0]).toMatchObject({
      name: "Bildschirmfoto 2026-07-02 um 21.21.54.png",
      verified: true,
    });
  });

  it("keeps unknown entries as unverified column-guess rows", () => {
    const out = "-rw-r--r--  1 kevin staff  10 2 Jul 20:00 vanished.txt";
    const rows = parseLsLong(out, NAMES);
    expect(rows?.[0]).toMatchObject({ name: "vanished.txt", verified: false });
  });

  it("returns null for non-long output", () => {
    expect(parseLsLong("src package.json README.md", NAMES)).toBeNull();
    expect(parseLsLong("", NAMES)).toBeNull();
  });
});

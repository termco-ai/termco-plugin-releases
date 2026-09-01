// Kept with the source-owning terminal plugin.
import { describe, expect, it } from "vitest";
import { findUrlAt } from "./urlMatch";

describe("findUrlAt", () => {
  it("finds a plain URL when col is inside it", () => {
    const line = "visit https://example.com for docs";
    const hit = findUrlAt(line, 10);
    expect(hit).toEqual({
      url: "https://example.com",
      startCol: 6,
      endCol: 25,
    });
  });

  it("includes the first and last URL characters", () => {
    const line = "visit https://example.com for docs";
    expect(findUrlAt(line, 6)?.url).toBe("https://example.com");
    expect(findUrlAt(line, 24)?.url).toBe("https://example.com");
  });

  it("returns null for cols outside the URL", () => {
    const line = "visit https://example.com for docs";
    expect(findUrlAt(line, 5)).toBeNull();
    expect(findUrlAt(line, 25)).toBeNull();
    expect(findUrlAt(line, 0)).toBeNull();
  });

  it("matches plain http URLs too", () => {
    expect(findUrlAt("go http://foo.dev now", 5)?.url).toBe("http://foo.dev");
  });

  it("does not match non-http(s) schemes", () => {
    const line = "ftp://files.example.com/pub";
    for (let col = 0; col < line.length; col++) {
      expect(findUrlAt(line, col)).toBeNull();
    }
  });

  it("does not match a bare scheme with no host", () => {
    expect(findUrlAt("https:// nothing", 0)).toBeNull();
  });

  it("trims trailing prose punctuation", () => {
    const hit = findUrlAt("see https://example.com.", 6);
    expect(hit?.url).toBe("https://example.com");
    expect(hit?.endCol).toBe(23);
    // The trimmed period is not part of the URL.
    expect(findUrlAt("see https://example.com.", 23)).toBeNull();
  });

  it("trims stacked trailing punctuation", () => {
    expect(findUrlAt("really? https://example.com/a?!", 10)?.url).toBe(
      "https://example.com/a",
    );
  });

  it("keeps balanced parens in wikipedia-style URLs", () => {
    const line = "(https://en.wikipedia.org/wiki/Foo_(bar))";
    const hit = findUrlAt(line, 1);
    expect(hit).toEqual({
      url: "https://en.wikipedia.org/wiki/Foo_(bar)",
      startCol: 1,
      endCol: 40,
    });
  });

  it("trims an unbalanced closing paren", () => {
    expect(findUrlAt("see (https://example.com/a)", 6)?.url).toBe(
      "https://example.com/a",
    );
  });

  it("trims an unbalanced closing bracket", () => {
    expect(findUrlAt("[https://example.com]", 1)?.url).toBe(
      "https://example.com",
    );
  });

  it("trims mixed trailing closer + punctuation", () => {
    expect(findUrlAt("(https://example.com).", 1)?.url).toBe(
      "https://example.com",
    );
  });

  it("stops at quote delimiters", () => {
    expect(findUrlAt('url is "https://example.com/x" ok', 9)?.url).toBe(
      "https://example.com/x",
    );
  });

  it("picks the URL containing col when a line has several", () => {
    const line = "a https://one.dev b https://two.dev";
    expect(findUrlAt(line, 2)?.url).toBe("https://one.dev");
    expect(findUrlAt(line, 20)?.url).toBe("https://two.dev");
    expect(findUrlAt(line, 18)).toBeNull(); // the " b " gap
  });

  it("finds a URL at line start", () => {
    const hit = findUrlAt("https://start.dev rest", 0);
    expect(hit?.url).toBe("https://start.dev");
    expect(hit?.startCol).toBe(0);
  });

  it("finds a URL at line end", () => {
    const line = "end https://end.dev";
    const hit = findUrlAt(line, line.length - 1);
    expect(hit?.url).toBe("https://end.dev");
    expect(hit?.endCol).toBe(line.length);
  });

  it("handles empty lines and out-of-range cols", () => {
    expect(findUrlAt("", 0)).toBeNull();
    expect(findUrlAt("no links here", 4)).toBeNull();
    expect(findUrlAt("https://x.dev", -1)).toBeNull();
    expect(findUrlAt("https://x.dev", 999)).toBeNull();
  });
});

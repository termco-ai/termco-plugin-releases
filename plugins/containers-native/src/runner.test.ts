import { describe, expect, it } from "vitest";
import { ok, runCli, searchCli } from "./runner";

describe("runCli", () => {
  it("reports spawnError when the binary does not exist", async () => {
    const out = await runCli("definitely-not-a-real-binary-xyz", ["ps"], 5);
    expect(out.spawnError).toBe(true);
    expect(ok(out)).toBe(false);
  });

  it("captures stdout and a zero exit for a real command", async () => {
    const out = await runCli("printf", ["hello"], 5);
    expect(ok(out)).toBe(true);
    expect(out.stdout).toBe("hello");
    expect(out.spawnError).toBe(false);
  });

  it("reports a non-zero exit code without throwing", async () => {
    const out = await runCli("sh", ["-c", "exit 3"], 5);
    expect(out.spawnError).toBe(false);
    expect(out.exitCode).toBe(3);
    expect(ok(out)).toBe(false);
  });

  it("truncates to the FIRST bytes by default", async () => {
    const out = await runCli("printf", ["abcdefghij"], 5, { maxBytes: 4 });
    expect(out.stdout).toBe("abcd");
    expect(out.truncated).toBe(true);
  });

  it("keeps the LAST bytes with keepTail (correct for logs)", async () => {
    const out = await runCli("printf", ["abcdefghij"], 5, {
      maxBytes: 4,
      keepTail: true,
    });
    expect(out.stdout).toBe("ghij");
    expect(out.truncated).toBe(true);
  });

  it("does not truncate when output fits the cap", async () => {
    const out = await runCli("printf", ["hello"], 5, {
      maxBytes: 1024,
      keepTail: true,
    });
    expect(out.stdout).toBe("hello");
    expect(out.truncated).toBe(false);
  });
});

describe("searchCli", () => {
  const DOC = "alpha\nfind me 1\nbeta\nFIND ME 2\ngamma\nfind me 3\n";

  it("returns matching lines with 1-based line numbers (case-insensitive)", async () => {
    const res = await searchCli("printf", [DOC], { query: "find me" });
    expect(res.spawnError).toBe(false);
    expect(res.matched).toBe(3);
    expect(res.matches).toEqual([
      { line: 2, text: "find me 1" },
      { line: 4, text: "FIND ME 2" },
      { line: 6, text: "find me 3" },
    ]);
    expect(res.truncated).toBe(false);
  });

  it("is case-sensitive when ignoreCase is false", async () => {
    const res = await searchCli("printf", [DOC], {
      query: "find me",
      ignoreCase: false,
    });
    expect(res.matches.map((m) => m.line)).toEqual([2, 6]); // not "FIND ME 2"
  });

  it("caps at maxMatches and reports truncated", async () => {
    const res = await searchCli("printf", ["x\nx\nx\nx\nx\n"], {
      query: "x",
      maxMatches: 2,
    });
    expect(res.matches).toHaveLength(2);
    expect(res.truncated).toBe(true);
  });

  it("returns no matches for an absent needle", async () => {
    const res = await searchCli("printf", [DOC], { query: "zzz" });
    expect(res.matched).toBe(0);
    expect(res.matches).toEqual([]);
  });

  it("reports spawnError for a missing binary", async () => {
    const res = await searchCli("definitely-not-real-xyz", ["logs"], {
      query: "x",
    });
    expect(res.spawnError).toBe(true);
  });

  it("matches with a regular expression when regex is set", async () => {
    const res = await searchCli("printf", ["a1\nb2\nc3\nnope\n"], {
      query: "^[abc]\\d$",
      regex: true,
    });
    expect(res.matches.map((m) => m.text)).toEqual(["a1", "b2", "c3"]);
  });

  it("falls back to substring on an invalid regex", async () => {
    const res = await searchCli("printf", ["a(b\nxy\n"], {
      query: "a(b",
      regex: true,
    });
    expect(res.matches.map((m) => m.text)).toEqual(["a(b"]);
  });

  it("includes before/after context lines when context > 0", async () => {
    const res = await searchCli("printf", ["l1\nl2\nHIT\nl4\nl5\n"], {
      query: "HIT",
      context: 1,
    });
    expect(res.matches).toHaveLength(1);
    expect(res.matches[0]).toMatchObject({
      text: "HIT",
      before: ["l2"],
      after: ["l4"],
    });
  });

  it("omits context arrays when context is 0", async () => {
    const res = await searchCli("printf", [DOC], { query: "find me 1" });
    expect(res.matches[0]).toEqual({ line: 2, text: "find me 1" });
  });
});

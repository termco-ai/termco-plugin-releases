import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@termco/agents-base";
import {
  findHighlights,
  messagesFromEvents,
  searchTranscript,
  snippetAround,
} from "./search";

describe("messagesFromEvents", () => {
  it("keeps only human/assistant text, dropping tools + reasoning", () => {
    const events: AgentEvent[] = [
      { type: "user-message", text: "deploy the api" },
      { type: "reasoning", text: "thinking about deploy" },
      { type: "tool-start", toolCallId: "t1", name: "Bash", input: {} },
      { type: "text", text: "Deploying now" },
      { type: "tool-end", toolCallId: "t1", output: "ok" },
    ];
    expect(messagesFromEvents(events)).toEqual([
      { role: "user", text: "deploy the api" },
      { role: "assistant", text: "Deploying now" },
    ]);
  });
});

describe("findHighlights", () => {
  it("finds all case-insensitive occurrences", () => {
    expect(findHighlights("Foo foo FOO", "foo")).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ]);
  });

  it("returns nothing for an empty needle or no match", () => {
    expect(findHighlights("hello", "")).toEqual([]);
    expect(findHighlights("hello", "zzz")).toEqual([]);
  });

  it("does not overlap adjacent matches", () => {
    expect(findHighlights("aaaa", "aa")).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });
});

describe("snippetAround", () => {
  it("windows around the first hit and rebases the offsets", () => {
    const text = `${"x".repeat(100)}NEEDLE${"y".repeat(100)}`;
    const hl = findHighlights(text, "needle");
    const snip = snippetAround(text, hl, 10);
    expect(snip).not.toBeNull();
    if (!snip) return;
    // Ellipsis on both sides (cut from a longer string).
    expect(snip.snippet.startsWith("…")).toBe(true);
    expect(snip.snippet.endsWith("…")).toBe(true);
    // The highlight points at "NEEDLE" inside the snippet.
    const h = snip.highlights[0];
    expect(snip.snippet.slice(h.start, h.end)).toBe("NEEDLE");
  });

  it("flattens newlines without shifting offsets", () => {
    const text = "line one\nfind me\nline three";
    const hl = findHighlights(text, "find me");
    const snip = snippetAround(text, hl, 20);
    if (!snip) throw new Error("expected a snippet");
    expect(snip.snippet).not.toContain("\n");
    const h = snip.highlights[0];
    expect(snip.snippet.slice(h.start, h.end)).toBe("find me");
  });

  it("omits ellipsis when the window covers the whole text", () => {
    const snip = snippetAround("hello world", findHighlights("hello world", "world"), 64);
    expect(snip?.snippet).toBe("hello world");
  });
});

describe("searchTranscript", () => {
  const events: AgentEvent[] = [
    { type: "user-message", text: "how do I deploy the worker?" },
    { type: "text", text: "Run the deploy script to deploy." },
    { type: "text", text: "unrelated answer" },
  ];

  it("returns matches per message with a global total", () => {
    const { matches, total } = searchTranscript(events, "deploy");
    // "deploy" appears once in the user msg + twice in the first assistant msg.
    expect(total).toBe(3);
    expect(matches).toHaveLength(2);
    expect(matches[0].role).toBe("user");
    expect(matches[1].role).toBe("assistant");
  });

  it("caps the number of returned snippets but not the total", () => {
    const many: AgentEvent[] = Array.from({ length: 10 }, (_, i) => ({
      type: "text" as const,
      text: `hit ${i} deploy`,
    }));
    const { matches, total } = searchTranscript(many, "deploy", 3);
    expect(matches).toHaveLength(3);
    expect(total).toBe(10);
  });

  it("finds nothing when the query is absent", () => {
    expect(searchTranscript(events, "kubernetes").total).toBe(0);
  });
});
// Owned by the coding-agent-native provider plugin.

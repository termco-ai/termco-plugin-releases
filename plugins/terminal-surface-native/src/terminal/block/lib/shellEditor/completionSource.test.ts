// Kept with the source-owning terminal plugin.
// @vitest-environment jsdom
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { historyField } from "../historyPopover/state";
import { pathCompletions } from "../pathComplete";
import { makeCompletionSource } from "./completionSource";

vi.mock("../pathComplete", () => ({ pathCompletions: vi.fn() }));

const pathMock = vi.mocked(pathCompletions);

function ctx(doc: string, pos = doc.length, explicit = false) {
  const state = EditorState.create({ doc });
  return new CompletionContext(state, pos, explicit);
}

beforeEach(() => {
  pathMock.mockReset();
  pathMock.mockResolvedValue(null);
});

describe("makeCompletionSource: command position", () => {
  it("completes command names from the live list at line start", async () => {
    const source = makeCompletionSource(
      () => ["git", "gitk", "grep"],
      () => null,
    );
    const res = await source(ctx("gi"));
    expect(res?.from).toBe(0);
    expect(res?.options.map((o) => o.label)).toEqual(["git", "gitk"]);
    expect(res?.options[0].type).toBe("function");
  });

  it("falls back to the static command list when history is empty", async () => {
    const source = makeCompletionSource(
      () => [],
      () => null,
    );
    const res = await source(ctx("gre"));
    expect(res?.options.map((o) => o.label)).toContain("grep");
  });

  it("appends matching shell keywords", async () => {
    const source = makeCompletionSource(
      () => ["ifconfig"],
      () => null,
    );
    const res = await source(ctx("if"));
    const byLabel = new Map(res?.options.map((o) => [o.label, o.type]));
    expect(byLabel.get("ifconfig")).toBe("function");
    expect(byLabel.get("if")).toBe("keyword");
  });

  it("caps command matches at 50", async () => {
    const many = Array.from({ length: 80 }, (_, i) => `cmd-${i}`);
    const source = makeCompletionSource(
      () => many,
      () => null,
    );
    const res = await source(ctx("cmd-"));
    expect(res?.options).toHaveLength(50);
  });

  it("treats the token after a separator as a command position", async () => {
    const source = makeCompletionSource(
      () => ["grep"],
      () => null,
    );
    for (const doc of ["ls; gr", "ls | gr", "ls && gr", "(gr"]) {
      const res = await source(ctx(doc));
      expect(res?.options.map((o) => o.label)).toContain("grep");
    }
  });
});

describe("makeCompletionSource: argument position", () => {
  it("returns null for an empty implicit match", async () => {
    const source = makeCompletionSource(
      () => [],
      () => null,
    );
    expect(await source(ctx("cat "))).toBeNull();
  });

  it("uses path completions when a cwd is available", async () => {
    pathMock.mockResolvedValue({
      fromOffset: 4,
      options: [{ label: "main.ts" }],
    });
    const source = makeCompletionSource(
      () => [],
      () => "/repo",
    );
    const res = await source(ctx("cat src/ma"));
    expect(pathMock).toHaveBeenCalledWith("src/ma", "/repo");
    expect(res?.from).toBe("cat ".length + 4);
    expect(res?.options.map((o) => o.label)).toEqual(["main.ts"]);
  });

  it("falls back to on-screen words when path completion is empty", async () => {
    pathMock.mockResolvedValue({ fromOffset: 0, options: [] });
    const source = makeCompletionSource(
      () => [],
      () => "/repo",
    );
    const res = await source(ctx("cat foobar fooqux foo"));
    expect(res?.options.map((o) => o.label)).toEqual([
      "cat",
      "foobar",
      "fooqux",
    ]);
    expect(res?.options[0].type).toBe("text");
  });

  it("skips path completion entirely without a cwd", async () => {
    const source = makeCompletionSource(
      () => [],
      () => null,
    );
    const res = await source(ctx("cat proj"));
    expect(pathMock).not.toHaveBeenCalled();
    expect(res?.options.map((o) => o.label)).toEqual(["cat"]);
  });

  it("completes an explicit empty argument token", async () => {
    const source = makeCompletionSource(
      () => [],
      () => null,
    );
    const res = await source(ctx("cat foo ", undefined, true));
    expect(res?.options.map((o) => o.label)).toEqual(["cat", "foo"]);
  });
});

describe("makeCompletionSource: history popover interplay", () => {
  it("yields to the history popover when it is open", async () => {
    const source = makeCompletionSource(
      () => ["git"],
      () => null,
    );
    const state = EditorState.create({
      doc: "gi",
      extensions: [
        historyField.init(() => ({ open: true, items: ["git log"], index: 0 })),
      ],
    });
    expect(await source(new CompletionContext(state, 2, false))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  type AnyPart,
  basename,
  buildPartGroups,
  partType,
  readPathFromPart,
} from "./partGroups";

function read(id: string, path: string, state = "output-available"): AnyPart {
  return {
    type: "tool-read_file",
    toolCallId: id,
    state,
    input: { path },
  } as unknown as AnyPart;
}

function text(t: string): AnyPart {
  return { type: "text", text: t } as unknown as AnyPart;
}

/** A coding-agent `Read` tool part, keyed on `file_path`. */
function agentRead(id: string, filePath: string): AnyPart {
  return {
    type: "tool-Read",
    toolCallId: id,
    state: "output-available",
    input: { file_path: filePath },
  } as unknown as AnyPart;
}

describe("partType", () => {
  it("returns the type string", () => {
    expect(partType(text("x"))).toBe("text");
  });

  it("returns empty string for a part without a type", () => {
    expect(partType({} as AnyPart)).toBe("");
  });
});

describe("buildPartGroups", () => {
  it("keeps non-read parts as singletons with their indexes", () => {
    const groups = buildPartGroups([text("a"), text("b")]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ kind: "single", idx: 0, key: "i-0" });
    expect(groups[1]).toMatchObject({ kind: "single", idx: 1, key: "i-1" });
  });

  it("collapses two or more consecutive reads into one group", () => {
    const groups = buildPartGroups([
      read("t1", "/a"),
      read("t2", "/b"),
      read("t3", "/c"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: "reads", key: "reads-t1" });
    expect((groups[0] as { parts: AnyPart[] }).parts).toHaveLength(3);
  });

  it("keeps a lone read as a single", () => {
    const groups = buildPartGroups([text("a"), read("t1", "/a"), text("b")]);
    expect(groups.map((g) => g.kind)).toEqual(["single", "single", "single"]);
    expect(groups[1]).toMatchObject({ idx: 1, key: "t1" });
  });

  it("flushes a run when a non-read part interrupts it", () => {
    const groups = buildPartGroups([
      read("t1", "/a"),
      read("t2", "/b"),
      text("between"),
      read("t3", "/c"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["reads", "single", "single"]);
    expect(groups[2]).toMatchObject({ idx: 3, key: "t3" });
  });

  it("does not group approval-requested reads", () => {
    const groups = buildPartGroups([
      read("t1", "/a", "approval-requested"),
      read("t2", "/b", "approval-requested"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["single", "single"]);
  });

  it("uses the approval id as key when toolCallId is missing", () => {
    const part = {
      type: "text",
      approval: { id: "ap-9" },
    } as unknown as AnyPart;
    const groups = buildPartGroups([part]);
    expect(groups[0]).toMatchObject({ key: "ap-9" });
  });

  it("flushes a trailing run at the end of the parts list", () => {
    const groups = buildPartGroups([
      text("a"),
      read("t1", "/a"),
      read("t2", "/b"),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["single", "reads"]);
  });

  it("returns no groups for an empty parts list", () => {
    expect(buildPartGroups([])).toEqual([]);
  });
});

describe("readPathFromPart", () => {
  it("returns the input path when present", () => {
    expect(readPathFromPart(read("t1", "/src/x.ts"))).toBe("/src/x.ts");
  });

  it("returns null for a missing input", () => {
    expect(readPathFromPart(text("x"))).toBeNull();
  });

  it("returns null for an empty or non-string path", () => {
    expect(readPathFromPart(read("t1", ""))).toBeNull();
    expect(
      readPathFromPart({
        type: "tool-read_file",
        input: { path: 42 },
      } as unknown as AnyPart),
    ).toBeNull();
  });

  it("reads the Claude Read tool's file_path", () => {
    expect(readPathFromPart(agentRead("a1", "/repo/main.ts"))).toBe(
      "/repo/main.ts",
    );
  });
});

describe("buildPartGroups with agent Read tools", () => {
  it("collapses consecutive Claude Read parts into a reads group", () => {
    const groups = buildPartGroups([
      agentRead("a1", "/a.ts"),
      agentRead("a2", "/b.ts"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("reads");
  });
});

describe("basename", () => {
  it("handles unix separators", () => {
    expect(basename("/a/b/c.ts")).toBe("c.ts");
  });

  it("handles windows separators", () => {
    expect(basename("C:\\Users\\me\\f.txt")).toBe("f.txt");
  });

  it("handles mixed separators by taking the last one", () => {
    expect(basename("C:/Users\\me/dir\\f.txt")).toBe("f.txt");
  });

  it("returns the input when there is no separator", () => {
    expect(basename("plain.txt")).toBe("plain.txt");
  });
});

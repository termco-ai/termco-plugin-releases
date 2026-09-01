import { describe, expect, it } from "vitest";
import { createRigRegistry } from "./rigRegistry";

describe("rigRegistry.resolveByCwd", () => {
  it("longest-prefix wins over a shallower rig", () => {
    const reg = createRigRegistry();
    reg.set([
      { id: "outer", name: "repo", root: "/repo" },
      { id: "inner", name: "pkg", root: "/repo/pkg" },
    ]);
    expect(reg.resolveByCwd("/repo/pkg/src/a")?.id).toBe("inner");
    expect(reg.resolveByCwd("/repo/other")?.id).toBe("outer");
    expect(reg.resolveByCwd("/repo")?.id).toBe("outer");
  });

  it("matches the root exactly and requires a path boundary", () => {
    const reg = createRigRegistry();
    reg.set([{ id: "r", name: "app", root: "/srv/app" }]);
    expect(reg.resolveByCwd("/srv/app")?.id).toBe("r");
    expect(reg.resolveByCwd("/srv/app/x")?.id).toBe("r");
    // A sibling that merely shares a prefix string is NOT a match.
    expect(reg.resolveByCwd("/srv/app-other")).toBeNull();
  });

  it("normalizes a trailing slash on the root", () => {
    const reg = createRigRegistry();
    reg.set([{ id: "r", name: "app", root: "/srv/app/" }]);
    expect(reg.resolveByCwd("/srv/app/x")?.id).toBe("r");
  });

  it("returns null for an empty cwd or no match", () => {
    const reg = createRigRegistry();
    reg.set([{ id: "r", name: "app", root: "/srv/app" }]);
    expect(reg.resolveByCwd("")).toBeNull();
    expect(reg.resolveByCwd("/elsewhere")).toBeNull();
  });

  it("ignores malformed entries on set", () => {
    const reg = createRigRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: exercising bad input
    reg.set([{ id: "r", name: "ok", root: "/r" }, null as any, { id: 5 } as any]);
    expect(reg.list()).toHaveLength(1);
  });
});
// Owned by the mcp-server-native provider plugin.

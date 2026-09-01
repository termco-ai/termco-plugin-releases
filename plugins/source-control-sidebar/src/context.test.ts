import { describe, expect, it } from "vitest";
import { sourceControlContextPath } from "./context";

const tab = (kind: string, data: Record<string, unknown>) => ({
  id: 1,
  rigId: "rig",
  kind,
  title: kind,
  data,
});

describe("source-control repository context", () => {
  it("uses the selected terminal leaf cwd", () => {
    expect(
      sourceControlContextPath(
        tab("terminal", {
          activeLeafId: 3,
          paneTree: {
            kind: "split",
            first: { kind: "leaf", id: 2, cwd: "/first" },
            second: { kind: "leaf", id: 3, cwd: "/second" },
          },
        }),
        "/workspace",
      ),
    ).toBe("/second");
  });

  it("uses the editor directory and Git repository roots", () => {
    expect(
      sourceControlContextPath(tab("editor", { path: "/repo/src/app.ts" }), null),
    ).toBe("/repo/src");
    expect(
      sourceControlContextPath(
        tab("git-history", { repoRoot: "/repo" }),
        "/workspace",
      ),
    ).toBe("/repo");
  });

  it("falls back to the active rig root", () => {
    expect(sourceControlContextPath(tab("preview", {}), "/workspace")).toBe(
      "/workspace",
    );
  });
});

import { describe, expect, it } from "vitest";
import { getSourceControlRemoteIndicator } from "./indicator";
import type { SourceControlSummary } from "./types";

type Input = Pick<
  SourceControlSummary,
  "hasRepo" | "upstream" | "ahead" | "behind" | "busyAction"
>;

function summary(overrides: Partial<Input>): Input {
  return {
    hasRepo: true,
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    busyAction: null,
    ...overrides,
  };
}

describe("getSourceControlRemoteIndicator", () => {
  it("is hidden without a repo", () => {
    expect(
      getSourceControlRemoteIndicator(summary({ hasRepo: false })),
    ).toEqual({
      visible: false,
      label: "",
      title: "",
      disabled: true,
      action: null,
    });
  });

  it("is hidden without an upstream", () => {
    const result = getSourceControlRemoteIndicator(summary({ upstream: null }));
    expect(result.visible).toBe(false);
    expect(result.action).toBeNull();
  });

  it("shows a disabled diverged indicator", () => {
    const result = getSourceControlRemoteIndicator(
      summary({ ahead: 2, behind: 3 }),
    );
    expect(result.visible).toBe(true);
    expect(result.label).toBe("↑2 ↓3");
    expect(result.disabled).toBe(true);
    expect(result.action).toBeNull();
    expect(result.title).toContain("diverged");
  });

  it("offers pull when behind, pluralizing commits", () => {
    const one = getSourceControlRemoteIndicator(summary({ behind: 1 }));
    expect(one.label).toBe("↓1");
    expect(one.title).toBe("Pull 1 remote commit with fast-forward only.");
    expect(one.action).toBe("pull");
    expect(one.disabled).toBe(false);

    const many = getSourceControlRemoteIndicator(summary({ behind: 4 }));
    expect(many.title).toBe("Pull 4 remote commits with fast-forward only.");
  });

  it("offers push when ahead, pluralizing commits", () => {
    const one = getSourceControlRemoteIndicator(summary({ ahead: 1 }));
    expect(one.label).toBe("↑1");
    expect(one.title).toBe("Push 1 local commit.");
    expect(one.action).toBe("push");

    const many = getSourceControlRemoteIndicator(summary({ ahead: 5 }));
    expect(many.title).toBe("Push 5 local commits.");
  });

  it("offers fetch when in sync", () => {
    const result = getSourceControlRemoteIndicator(summary({}));
    expect(result).toEqual({
      visible: true,
      label: "Sync",
      title: "Fetch remote updates.",
      disabled: false,
      action: "fetch",
    });
  });

  it("disables the action while another remote action is busy", () => {
    expect(
      getSourceControlRemoteIndicator(summary({ busyAction: "fetch" }))
        .disabled,
    ).toBe(true);
    expect(
      getSourceControlRemoteIndicator(
        summary({ behind: 2, busyAction: "pull" }),
      ).disabled,
    ).toBe(true);
    expect(
      getSourceControlRemoteIndicator(summary({ ahead: 2, busyAction: "push" }))
        .disabled,
    ).toBe(true);
  });
});

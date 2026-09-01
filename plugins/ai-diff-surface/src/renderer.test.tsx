// @vitest-environment jsdom
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { UiTabKindContribution } from "@termco/ui-tabs-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type StackProps = {
  tabs: Array<{ approvalId: string }>;
  activeId: number;
  onAccept: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
};

let stackProps: StackProps | null = null;

vi.mock("./baseline/components/AiDiffStack", () => ({
  AiDiffStack: (props: StackProps) => {
    stackProps = props;
    return <div data-testid="ai-diff-stack" />;
  },
}));

import plugin from "./renderer";

afterEach(() => {
  cleanup();
  stackProps = null;
});

describe("AI diff plugin wiring", () => {
  it("routes review decisions through the shared AI sessions capability", async () => {
    const respondToApproval = vi.fn();
    const sessions = { respondToApproval } as unknown as AiSessionsCapability;
    const theme = {} as UiThemeCapability;
    let contribution: UiTabKindContribution | null = null;
    const disposers: Array<() => void | Promise<void>> = [];
    await plugin.activate({
      get: (capability: string) => {
        if (capability === "ai.sessions") return sessions;
        if (capability === "ui.theme") return theme;
        return {
          register(value: UiTabKindContribution) {
            contribution = value;
            return () => {};
          },
        };
      },
      effect: async (
        install: () =>
          | void
          | (() => void)
          | Promise<void | (() => void)>,
      ) => {
        const dispose = await install();
        if (typeof dispose === "function") disposers.push(dispose);
        return dispose;
      },
    } as never);

    expect(contribution).not.toBeNull();
    const Surface = contribution!.Component;
    render(
      <Surface
        tabs={[
          {
            id: 12,
            rigId: "remote-rig",
            kind: "ai-diff",
            title: "Review change",
            cold: false,
            data: {
              path: "/srv/project/file.ts",
              originalContent: "old",
              proposedContent: "new",
              approvalId: "approval-12",
              status: "pending",
              isNewFile: false,
            },
          },
        ]}
        activeId={12}
        surfaceVisible
        runtime={{} as never}
      />,
    );

    expect(stackProps?.tabs).toEqual([
      expect.objectContaining({ approvalId: "approval-12" }),
    ]);
    stackProps?.onAccept("approval-12");
    stackProps?.onReject("approval-12");
    expect(respondToApproval).toHaveBeenNthCalledWith(1, "approval-12", true);
    expect(respondToApproval).toHaveBeenNthCalledWith(2, "approval-12", false);

    for (const dispose of disposers.reverse()) await dispose();
  });
});

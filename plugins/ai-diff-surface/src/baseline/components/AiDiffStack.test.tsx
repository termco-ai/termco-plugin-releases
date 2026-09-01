// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AiDiffTab, Tab } from "../../tabTypes";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

type PaneProps = {
  path: string;
  status: string;
  isNewFile: boolean;
  onAccept: () => void;
  onReject: () => void;
};

let lastPaneProps: PaneProps | null = null;

vi.mock("./AiDiffPane", () => ({
  AiDiffPane: (props: PaneProps) => {
    lastPaneProps = props;
    return <div data-testid="ai-diff-pane">{props.path}</div>;
  },
}));

import { AiDiffStack } from "./AiDiffStack";

function diffTab(id: number, overrides: Partial<AiDiffTab> = {}): AiDiffTab {
  return {
    id,
    kind: "ai-diff",
    title: "diff",
    path: `/ws/f${id}.ts`,
    originalContent: "old",
    proposedContent: "new",
    approvalId: `approval-${id}`,
    status: "pending",
    isNewFile: false,
    rigId: "default",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  lastPaneProps = null;
});

describe("AiDiffStack", () => {
  it("renders nothing when the active tab is not an ai-diff", () => {
    const tabs: Tab[] = [diffTab(1)];
    const { container } = render(
      <AiDiffStack
        tabs={tabs}
        activeId={99}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the pane for the active ai-diff tab", () => {
    const tabs: Tab[] = [diffTab(1), diffTab(2)];
    render(
      <AiDiffStack
        tabs={tabs}
        activeId={2}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByTestId("ai-diff-pane")).toHaveTextContent("/ws/f2.ts");
  });

  it("forwards accept/reject keyed by the tab's approvalId", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    render(
      <AiDiffStack
        tabs={[diffTab(7)]}
        activeId={7}
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    lastPaneProps?.onAccept();
    expect(onAccept).toHaveBeenCalledWith("approval-7");
    lastPaneProps?.onReject();
    expect(onReject).toHaveBeenCalledWith("approval-7");
  });
});

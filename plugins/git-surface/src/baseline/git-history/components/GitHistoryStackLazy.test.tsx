// @vitest-environment jsdom
import type { Tab } from "../../../tabTypes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./GitHistoryStack", () => ({
  GitHistoryStack: ({ activeId }: { activeId: number }) => (
    <div data-testid="git-history-stack-inner">{activeId}</div>
  ),
}));

import { GitHistoryStack } from "./GitHistoryStackLazy";

afterEach(() => {
  cleanup();
});

describe("GitHistoryStack lazy boundary", () => {
  it("loads and renders the inner stack with forwarded props", async () => {
    render(
      <GitHistoryStack
        tabs={[] as Tab[]}
        activeId={7}
        onOpenCommitFile={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("git-history-stack-inner").textContent).toBe(
        "7",
      );
    });
  });
});

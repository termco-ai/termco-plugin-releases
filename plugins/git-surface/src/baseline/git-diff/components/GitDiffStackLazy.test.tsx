// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { Tab } from "../../../tabTypes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./GitDiffStack", () => ({
  GitDiffStack: (props: { activeId: number }) => (
    <div data-testid="git-diff-stack-inner">{props.activeId}</div>
  ),
}));

import { GitDiffStack } from "./GitDiffStackLazy";

afterEach(() => {
  cleanup();
});

describe("GitDiffStack lazy boundary", () => {
  it("loads and renders the inner stack with forwarded props", async () => {
    render(<GitDiffStack tabs={[] as Tab[]} activeId={11} />);
    await waitFor(() => {
      expect(screen.getByTestId("git-diff-stack-inner")).toHaveTextContent(
        "11",
      );
    });
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { Tab } from "../../tabTypes";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./AiDiffStack", () => ({
  AiDiffStack: (props: { activeId: number }) => (
    <div data-testid="ai-diff-stack-inner">{props.activeId}</div>
  ),
}));

import { AiDiffStack } from "./AiDiffStackLazy";

afterEach(() => {
  cleanup();
});

describe("AiDiffStack lazy boundary", () => {
  it("loads and renders the inner stack with forwarded props", async () => {
    render(
      <AiDiffStack
        tabs={[] as Tab[]}
        activeId={7}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("ai-diff-stack-inner")).toHaveTextContent("7");
    });
  });
});

// @vitest-environment jsdom
import "../../testDependencies";
import type { Tab } from "../../types";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OverlayChip } from "./OverlayChip";

afterEach(cleanup);

describe("OverlayChip", () => {
  it("renders a color dot for a rig drag", () => {
    const { container } = render(
      <OverlayChip color="rgb(1, 2, 3)" label="Work" />,
    );
    expect(container.textContent).toContain("Work");
    const dot = container.querySelector("span[aria-hidden]") as HTMLElement;
    expect(dot.style.backgroundColor).toBe("rgb(1, 2, 3)");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the tab icon for a tab drag", () => {
    const tab: Tab = {
      id: 1,
      kind: "terminal",
      rigId: "s",
      title: "shell",
      label: "shell",
      dirty: false,
      preview: false,
      private: false,
    };
    const { container } = render(<OverlayChip tab={tab} label="shell" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.textContent).toContain("shell");
  });
});

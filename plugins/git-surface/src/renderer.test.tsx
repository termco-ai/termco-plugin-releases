import { render } from "@testing-library/react";
import type { UiTabsRuntime, UiTabSurfaceProps } from "@termco/ui-tabs-base";
import { beforeEach, describe, expect, it, vi } from "vitest";

const observedSearchCallbacks: unknown[] = [];

vi.mock("./baseline/git-history/components/GitHistoryStack", () => ({
  GitHistoryStack: (props: { onSearchHandle?: unknown }) => {
    observedSearchCallbacks.push(props.onSearchHandle);
    return null;
  },
}));

import { GitHistorySurface } from "./renderer";

describe("GitHistorySurface", () => {
  beforeEach(() => observedSearchCallbacks.splice(0));

  it("keeps the workspace search bridge stable across pane rerenders", () => {
    const runtime = {
      workspaceForRig: () => ({ kind: "local" as const }),
      registerSearchHandle: vi.fn(),
      openTab: vi.fn(),
    } as unknown as UiTabsRuntime;
    const props = {
      tabs: [
        {
          id: 1,
          rigId: "rig-1",
          kind: "git-history",
          title: "Git Graph",
          cold: false,
          data: { repoRoot: "/repo" },
        },
      ],
      activeId: 1,
      surfaceVisible: true,
      runtime,
    } satisfies UiTabSurfaceProps;

    const view = render(<GitHistorySurface {...props} />);
    view.rerender(<GitHistorySurface {...props} tabs={[...props.tabs]} />);

    expect(observedSearchCallbacks).toHaveLength(2);
    expect(observedSearchCallbacks[1]).toBe(observedSearchCallbacks[0]);
  });
});

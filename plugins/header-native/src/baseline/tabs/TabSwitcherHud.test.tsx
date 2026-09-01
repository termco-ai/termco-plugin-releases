// @vitest-environment jsdom
import "../testDependencies";
import type { UiHeaderTab } from "@termco/ui-header-base";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TabSwitcherHud } from "./TabSwitcherHud";

afterEach(cleanup);

const tabs: UiHeaderTab[] = [
  {
    id: 1,
    rigId: "rig-a",
    kind: "terminal",
    title: "shell",
    label: "termco-ai",
    cwd: "/Users/me/projects/termco-ai",
    dirty: false,
    preview: false,
    private: false,
  },
  {
    id: 2,
    rigId: "rig-a",
    kind: "editor",
    title: "foo.ts",
    label: "foo.ts",
    path: "/a/src/foo.ts",
    dirty: false,
    preview: false,
    private: false,
  },
  {
    id: 3,
    rigId: "rig-a",
    kind: "preview",
    title: "localhost:3000",
    label: "localhost:3000",
    dirty: false,
    preview: false,
    private: false,
  },
];

describe("TabSwitcherHud", () => {
  it("lists tabs in MRU order with the selection highlighted", () => {
    const { container } = render(
      <TabSwitcherHud tabs={tabs} state={{ order: [2, 1, 3], index: 1 }} />,
    );
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(".flex.items-center.gap-2"),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("foo.ts");
    expect(rows[1].textContent).toContain("termco-ai");
    expect(rows[2].textContent).toContain("localhost:3000");
    expect(rows[1].className).toContain("bg-accent");
    expect(rows[0].className).not.toContain("bg-accent");
  });

  it("shows path subtitles for terminal and editor tabs only", () => {
    const { container } = render(
      <TabSwitcherHud tabs={tabs} state={{ order: [1, 2, 3], index: 0 }} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("projects/termco-ai");
    expect(text).toContain("src");
  });

  it("skips ids that no longer resolve to a tab", () => {
    const { container } = render(
      <TabSwitcherHud tabs={tabs} state={{ order: [99, 1], index: 1 }} />,
    );
    const rows = container.querySelectorAll(".flex.items-center.gap-2");
    expect(rows).toHaveLength(1);
  });
});

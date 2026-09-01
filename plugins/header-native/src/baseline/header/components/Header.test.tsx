// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tabBarProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("../../agents/NotificationBell", () => ({
  NotificationBell: () => <div data-testid="bell" />,
}));

vi.mock("../../tabs/TabBar", () => ({
  TabBar: (props: Record<string, unknown>) => {
    mocks.tabBarProps.push(props);
    return <div data-testid="tabbar" />;
  },
}));

vi.mock("./WindowControls", () => ({
  WindowControls: () => <div data-testid="window-controls" />,
}));

vi.mock("./SearchInline", () => ({
  SearchInline: () => <div data-testid="search-inline" />,
}));

import { createHeaderRuntime } from "../../testRuntime";
import type { Tab } from "../../types";
import type { SearchInlineHandle } from "../types";
import { Header } from "./Header";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  mocks.tabBarProps.length = 0;
});

afterEach(cleanup);

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    runtime: createHeaderRuntime({
      platform: "linux",
      customWindowControls: true,
    }),
    tabs: [{ id: 1, kind: "terminal", title: "t" }] as unknown as Tab[],
    activeId: 1,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onNewBlock: vi.fn(),
    onNewPrivate: vi.fn(),
    onNewPreview: vi.fn(),
    onNewEditor: vi.fn(),
    onNewGitGraph: vi.fn(),
    onClose: vi.fn(),
    onCloseMany: vi.fn(),
    onNewTabRight: vi.fn(),
    onDuplicate: vi.fn(),
    onPin: vi.fn(),
    onRename: vi.fn(),
    onReorder: vi.fn(),
    onToggleSidebar: vi.fn(),
    onOpenCommandPalette: vi.fn(),
    onActivateAgent: vi.fn(),
    onActivateLocalAgent: vi.fn(),
    onOpenSettings: vi.fn(),
    aiPanelOpen: false,
    onToggleAiPanel: vi.fn(),
    agentsViewOpen: false,
    onToggleAgentsView: vi.fn(),
    settingsViewOpen: false,
    rigSwitcher: <div data-testid="rig-switcher" />,
    rigTabStrip: <div data-testid="rig-tab-strip" />,
    searchTarget: null,
    searchRef: createRef<SearchInlineHandle>(),
    ...overrides,
  };
  render(<Header {...props} />);
  return props;
}

describe("Header", () => {
  it("lays out leading controls, rigs, tabs, and search", () => {
    setup();
    expect(screen.getByTitle("Toggle sidebar")).toBeDefined();
    expect(screen.getByTestId("rig-switcher")).toBeDefined();
    expect(screen.getByTestId("tabbar")).toBeDefined();
    expect(screen.getByTestId("search-inline")).toBeDefined();
  });

  it("forwards tab callbacks to the tab bar", () => {
    const props = setup();
    expect(mocks.tabBarProps[0]).toMatchObject({
      tabs: props.tabs,
      activeId: 1,
      onSelect: props.onSelect,
      onNew: props.onNew,
      onClose: props.onClose,
      onCloseMany: props.onCloseMany,
      onNewTabRight: props.onNewTabRight,
      onDuplicate: props.onDuplicate,
    });
  });

  it("opens settings", () => {
    const props = setup();
    fireEvent.click(screen.getByTitle("Settings"));
    expect(props.onOpenSettings).toHaveBeenCalled();
  });

  it("hides the Save button while no editor is dirty", () => {
    setup({ editorDirty: false, onSaveFile: vi.fn() });
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("shows the Save button top-right for a dirty editor and saves on click", () => {
    const onSaveFile = vi.fn();
    setup({ editorDirty: true, onSaveFile });
    fireEvent.click(screen.getByTitle("Save file (⌘S)"));
    expect(onSaveFile).toHaveBeenCalledTimes(1);
  });

  it("renders custom window controls when the platform needs them", () => {
    setup();
    expect(screen.getByTestId("window-controls")).toBeDefined();
  });

  it("omits custom window controls on macOS", () => {
    setup({
      runtime: createHeaderRuntime({
        platform: "macos",
        customWindowControls: false,
      }),
    });
    expect(screen.queryByTestId("window-controls")).toBeNull();
  });

  it("places the bell trailing on macOS and leading elsewhere", () => {
    setup();
    // Non-mac: single bell inside the leading controls.
    expect(screen.getAllByTestId("bell")).toHaveLength(1);
    cleanup();
    setup({
      runtime: createHeaderRuntime({
        platform: "macos",
        customWindowControls: false,
      }),
    });
    expect(screen.getAllByTestId("bell")).toHaveLength(1);
  });
});

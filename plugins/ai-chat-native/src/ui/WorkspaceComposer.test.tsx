// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../store/store";
import {
  createAiConnectFooterContribution,
  WorkspaceComposerRegion,
  workspaceComposerCapability,
} from "./WorkspaceComposer";
import type { WorkspaceTabsCapability } from "@termco/workspace-base";

const composer = vi.hoisted(() => ({
  textareaRef: { current: null },
  files: [],
  removeFile: vi.fn(),
  pickedSnippets: [],
  removeSnippet: vi.fn(),
  setValue: vi.fn(),
  pickedCommands: [],
  removeCommand: vi.fn(),
}));
vi.mock("../baseline/lib/composer", () => ({ useComposer: () => composer }));
vi.mock("../baseline/components/ChipsRow", () => ({
  ChipsRow: ({ leading }: { leading?: React.ReactNode }) => (
    <div data-testid="exact-chips">{leading}</div>
  ),
}));
vi.mock("../baseline/components/AiComposerInput/AiComposerInput", () => ({
  AiComposerInput: () => <div data-testid="exact-input" />,
}));
vi.mock("../baseline/components/ComposerActions/ComposerActions", () => ({
  ComposerActions: () => <div data-testid="exact-actions" />,
}));

beforeEach(() => {
  useChatStore.setState(useChatStore.getInitialState(), true);
});
afterEach(cleanup);

describe("AI-owned workspace composer interface", () => {
  it("publishes availability and yields while another exact surface hosts it", () => {
    expect(workspaceComposerCapability.snapshot().available).toBe(false);
    useChatStore.setState({
      apiKeys: {
        ...useChatStore.getState().apiKeys,
        openai: "configured",
      },
      panelOpen: true,
    });
    expect(workspaceComposerCapability.snapshot()).toMatchObject({
      available: true,
      hostedElsewhere: true,
    });
  });

  it("routes all three established regions to the original components", () => {
    const { rerender } = render(
      <WorkspaceComposerRegion region="chips" visible leading={<span>cwd</span>} />,
    );
    expect(screen.getByTestId("exact-chips").textContent).toBe("cwd");
    rerender(<WorkspaceComposerRegion region="input" visible />);
    expect(screen.getByTestId("exact-input")).not.toBeNull();
    rerender(<WorkspaceComposerRegion region="actions" visible />);
    expect(screen.getByTestId("exact-actions")).not.toBeNull();
  });

  it("shows the original connect footer only for an unconfigured ordinary tab", () => {
    const snapshot = {
      revision: 1,
      initialized: true,
      tabs: [{ id: 1, rigId: "rig-a", kind: "terminal", title: "shell" }],
      activeId: 1,
      splitTabId: 0,
      booted: true,
      activeRigIdForNewTabs: "rig-a",
    } as const;
    const tabs = {
      snapshot: () => snapshot,
      subscribe: () => () => {},
    } as unknown as WorkspaceTabsCapability;
    useChatStore.setState({ keysLoaded: true, panelOpen: true });
    const footer = createAiConnectFooterContribution(tabs);
    render(<footer.Component />);
    expect(screen.getByText(/Connect any AI provider/)).not.toBeNull();
  });
});

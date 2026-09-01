// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { AiModelRegistry } from "@termco/ai-models-base";
import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import {
  EVENTS_APPLICATION_SERVICE,
  type ApplicationEventsCapability,
} from "@termco/events-base";
import type { GitCapability, GitPanelSnapshot } from "@termco/git-base";
import type { Dispose, PluginActivationContext } from "@termco/kernel";
import { TooltipProvider } from "@termco/ui";
import type { UiCommandRegistry } from "@termco/ui-commands-base";
import type {
  UiSidebarViewContribution,
  UiSidebarViewRegistry,
} from "@termco/ui-sidebar-base";
import type {
  WorkspaceTabsCapability,
  WorkspaceTabsSnapshot,
} from "@termco/workspace-base";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

const repoSnapshot: GitPanelSnapshot = {
  repo: {
    repoRoot: "/workspace",
    branch: "main",
    upstream: "origin/main",
    isDetached: false,
  },
  status: {
    repoRoot: "/workspace",
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    isDetached: false,
    truncated: false,
    changedFiles: [],
  },
};

const tabsSnapshot: WorkspaceTabsSnapshot = {
  revision: 1,
  initialized: true,
  tabs: [
    {
      id: 1,
      rigId: "default",
      kind: "terminal",
      title: "Terminal",
      data: {
        activeLeafId: 10,
        paneTree: { kind: "leaf", id: 10, cwd: "/workspace" },
      },
    },
  ],
  activeId: 1,
  splitTabId: 0,
  focusedPane: "left",
  booted: true,
  activeRigIdForNewTabs: "default",
  activeTabByRig: { default: 1 },
};

const sessionSnapshot = {
  revision: 1,
  panelOpen: false,
  miniOpen: false,
  selectedModelId: "",
  activeSessionId: null,
  agent: { status: "idle" as const, step: null, error: null },
};
const modelSnapshot: ReturnType<AiModelRegistry["snapshot"]> = [];

function stableServices() {
  const tabs = {
    snapshot: vi.fn(() => tabsSnapshot),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as WorkspaceTabsCapability;
  const sessions = {
    snapshot: vi.fn(() => sessionSnapshot),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as AiSessionsCapability;
  const models = {
    snapshot: vi.fn(() => modelSnapshot),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as AiModelRegistry;
  const git = {
    panelSnapshot: vi.fn(async () => repoSnapshot),
    status: vi.fn(async () => repoSnapshot.status),
  } as unknown as GitCapability;
  const events = {
    subscribe: vi.fn(() => () => undefined),
  } as unknown as ApplicationEventsCapability;
  return { tabs, sessions, models, git, events };
}

async function activateSelectedPanel() {
  const services = stableServices();
  const contributions: UiSidebarViewContribution[] = [];
  const effects: Dispose[] = [];
  const featureActivations: Promise<void>[] = [];
  const provided = new Map<string, unknown>();
  const sidebarViews = {
    register(entry: UiSidebarViewContribution) {
      contributions.push(entry);
      return () => {
        const index = contributions.indexOf(entry);
        if (index >= 0) contributions.splice(index, 1);
      };
    },
    snapshot: () => contributions,
    records: () => [],
    subscribe: () => () => undefined,
  } as UiSidebarViewRegistry;
  const commands = {
    register: () => () => undefined,
    snapshot: () => [],
    records: () => [],
    subscribe: () => () => undefined,
  } as UiCommandRegistry;
  const values = new Map<string, unknown>([
    ["git.repository", services.git],
    [
      "desktop.integration",
      { writeClipboardText: vi.fn(), revealItem: vi.fn() },
    ],
    ["ui.file-icons", { fileIconUrl: vi.fn(() => null) }],
    ["workspace.tabs", services.tabs],
    [EVENTS_APPLICATION_SERVICE, services.events],
    ["ai.models", services.models],
    ["ai.sessions", services.sessions],
    ["ui.sidebar.views", sidebarViews],
    ["ui.commands", commands],
  ]);
  const context: PluginActivationContext = {
      pluginId: "source-control-sidebar",
      generation: "test-generation",
      observe: <T,>(service: string) => ({
        current: () => values.get(service) as T | undefined,
        subscribe: () => () => {},
      }),
      feature: (_descriptor, activate) => {
        featureActivations.push(
          Promise.resolve(activate(context)).then((dispose) => {
            if (typeof dispose === "function") effects.push(dispose);
          }),
        );
        return () => {};
      },
    get<T>(service: string): T {
      if (!values.has(service)) {
        throw new Error(`capability "${service}" is not available`);
      }
      return values.get(service) as T;
    },
    entries: () => [],
    provide(service, value) {
      provided.set(service, value);
      return () => {
        provided.delete(service);
      };
    },
    async effect(install) {
      const dispose = await install();
      effects.push(dispose);
      return dispose;
    },
  };

  await plugin.activate(context);
  await Promise.all(featureActivations);
  const contribution = contributions[0];
  if (!contribution) throw new Error("Source Control view was not registered");
  return {
    Component: contribution.Component,
    services,
    async dispose() {
      for (const effect of effects.reverse()) await effect();
    },
  };
}

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("selected Source Control renderer integration", () => {
  it("renders the real panel with cached public snapshots", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });
    const selected = await activateSelectedPanel();
    const { Component } = selected;

    render(
      <TooltipProvider>
        <Component
          rootPath="/workspace"
          workspace={{ kind: "local" }}
          activeFilePath={null}
          openFileAt={vi.fn()}
          openFile={vi.fn()}
          navigateToPath={vi.fn()}
          pathRenamed={vi.fn()}
          pathDeleted={vi.fn()}
          attachFileToAgent={vi.fn()}
          runInNewTerminal={vi.fn(async () => undefined)}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole("button", { name: "Commit Graph" })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Commit message")).toBeVisible();
    });
    expect(selected.services.tabs.snapshot()).toBe(tabsSnapshot);
    expect(selected.services.sessions.snapshot()).toBe(sessionSnapshot);
    expect(selected.services.models.snapshot()).toBe(modelSnapshot);
    expect(
      errors.filter((message) =>
        /React error #185|Maximum update depth|getSnapshot should be cached/.test(
          message,
        ),
      ),
    ).toEqual([]);
    await selected.dispose();
  });
});

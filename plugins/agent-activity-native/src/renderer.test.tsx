// @vitest-environment jsdom
import type {
  AgentActivityCapability,
  AgentActivityControlCapability,
  AgentActivityEventContribution,
  AgentActivityEventRegistry,
} from "@termco/agents-base";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

const toast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast }));

type Harness = Awaited<ReturnType<typeof activate>>;

async function activate(reactions: AgentActivityEventContribution[] = []) {
  let focusListener: (focused: boolean) => void = () => {};
  let preferenceListener: (key: string, value: unknown) => void = () => {};
  const desktop = {
    notify: vi.fn(),
  };
  const desktopWindow = {
    focus: vi.fn(async () => {}),
    onFocusChanged(listener: (focused: boolean) => void) {
      focusListener = listener;
      return vi.fn();
    },
  };
  const preferences = {
    get: vi.fn(async () => true),
    subscribe(listener: (key: string, value: unknown) => void) {
      preferenceListener = listener;
      return vi.fn();
    },
  };
  const shortcuts = {
    bindings: vi.fn(() => [{ key: "agent.focusAttention" }]),
    format: vi.fn(() => ["Ctrl", "Shift", "A"]),
  };
  const provided = new Map<string, unknown>();
  const disposers: Array<() => void> = [];
  await plugin.activate({
    observe(id: string) {
      return {
        current: () => (id === "shortcuts.registry" ? shortcuts : undefined),
        subscribe: () => () => {},
      };
    },
    get(id: string) {
      if (id === "desktop.window") return desktopWindow;
      if (id === "desktop.integration") return desktop;
      if (id === "settings.preferences") return preferences;
      if (id === "shortcuts.registry") return shortcuts;
      throw new Error(`unexpected capability ${id}`);
    },
    provide(id: string, value: unknown) {
      provided.set(id, value);
      return () => provided.delete(id);
    },
    async effect(install: () => void | (() => void)) {
      const dispose = install();
      if (typeof dispose === "function") disposers.push(dispose);
    },
  } as never);
  const reactionRegistry = provided.get(
    "agents.activity-events",
  ) as AgentActivityEventRegistry;
  for (const reaction of reactions) {
    disposers.push(reactionRegistry.register(reaction) as () => void);
  }
  return {
    activity: provided.get("agents.activity") as AgentActivityCapability,
    control: provided.get(
      "agents.activity-control",
    ) as AgentActivityControlCapability,
    desktop,
    desktopWindow,
    focus: (focused: boolean) => focusListener(focused),
    preferences: (enabled: boolean) =>
      preferenceListener("agentNotifications", enabled),
    dispose: () => {
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}

afterEach(() => {
  cleanup();
  toast.mockReset();
  vi.restoreAllMocks();
});

describe("agent activity renderer", () => {
  it("preserves the focused hidden attention toast and shortcut action", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const harness: Harness = await activate();
    const activateTarget = vi.fn();
    harness.control.terminalSignal({
      kind: "started",
      leafId: 7,
      tabId: 3,
      agent: "claude",
    });
    harness.control.terminalSignal({
      kind: "attention",
      leafId: 7,
      visible: false,
      body: "dev server",
      activate: activateTarget,
    });

    expect(harness.activity.snapshot().notifications).toMatchObject([
      {
        source: "terminal",
        agent: "claude",
        kind: "attention",
        tabId: 3,
        leafId: 7,
        read: false,
      },
    ]);
    expect(toast).toHaveBeenCalledTimes(1);
    const [title, options] = toast.mock.calls[0] as [
      string,
      {
        action: { label: string; onClick(): void };
        description: ReactNode;
        duration: number;
      },
    ];
    expect(title).toBe("Claude Code needs your input");
    expect(options.duration).toBe(6000);
    expect(options.action.label).toBe("Open");
    render(<div>{options.description}</div>);
    expect(screen.getByText("dev server")).toBeDefined();
    expect(screen.getByText("Ctrl Shift A")).toBeDefined();
    options.action.onClick();
    expect(activateTarget).toHaveBeenCalledOnce();
    expect(harness.desktopWindow.focus).toHaveBeenCalledOnce();
    harness.dispose();
  });

  it("uses OS notifications while unfocused and suppresses visible events", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const harness = await activate();
    harness.control.terminalSignal({
      kind: "started",
      leafId: 7,
      tabId: 3,
      agent: "codex",
    });
    harness.focus(false);
    harness.control.terminalSignal({
      kind: "attention",
      leafId: 7,
      visible: true,
      activate: vi.fn(),
    });
    expect(harness.desktop.notify).toHaveBeenCalledWith(
      "Codex needs your input",
      "codex",
    );
    expect(toast).not.toHaveBeenCalled();

    harness.focus(true);
    harness.control.terminalSignal({
      kind: "finished",
      leafId: 7,
      visible: true,
      activate: vi.fn(),
    });
    expect(harness.activity.snapshot().notifications).toHaveLength(1);
    harness.dispose();
  });

  it("honors preference changes and emits lifecycle reactions", async () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const finished = vi.fn();
    const exited = vi.fn();
    const harness = await activate([{ id: "managed-review", finished, exited }]);
    harness.control.terminalSignal({
      kind: "started",
      leafId: 7,
      tabId: 3,
      agent: "gemini",
    });
    harness.preferences(false);
    harness.control.terminalSignal({
      kind: "attention",
      leafId: 7,
      visible: false,
      activate: vi.fn(),
    });
    expect(toast).not.toHaveBeenCalled();
    expect(harness.activity.snapshot().notifications).toEqual([]);

    harness.control.terminalSignal({
      kind: "finished",
      leafId: 7,
      visible: false,
      activate: vi.fn(),
    });
    expect(finished).toHaveBeenCalledWith(7);
    harness.control.terminalSignal({ kind: "exited", leafId: 7 });
    expect(exited).toHaveBeenCalledWith(7);
    expect(harness.activity.snapshot().sessions).toEqual([]);
    harness.dispose();
  });
});

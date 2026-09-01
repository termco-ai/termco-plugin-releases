// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { toggleFavoriteModel } from "../../lib/modelPrefs";
import { useChatStore } from "../../store/chatStore";
import { usePreferencesStore } from "../../runtime/preferences";
import { openSettingsWindow } from "../../runtime/settings";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROVIDER_KEYS } from "../../../store/constants";
import { ModelDropdown } from "./ModelDropdown";

const TEST_MODELS = [
  {
    id: "gpt-5.4-mini",
    provider: "openai" as const,
    label: "GPT-5.4 mini",
    hint: "Fast",
    description: "Snappy default at low cost.",
    capabilities: { intelligence: 4 as const, speed: 4 as const, cost: 4 as const },
  },
  {
    id: "gpt-5.5-pro",
    provider: "openai" as const,
    label: "GPT-5.5 Pro",
    hint: "Max",
    description: "Highest-accuracy model.",
    capabilities: { intelligence: 5 as const, speed: 2 as const, cost: 1 as const },
  },
  {
    id: "gpt-5.6-luna",
    provider: "openai" as const,
    label: "GPT-5.6 Luna",
    hint: "Fast",
    description: "Fast and affordable.",
    capabilities: { intelligence: 4 as const, speed: 5 as const, cost: 4 as const },
  },
  {
    id: "claude-fable-5",
    provider: "anthropic" as const,
    label: "Claude Fable 5",
    hint: "Best",
    description: "Frontier reasoning model.",
    capabilities: { intelligence: 5 as const, speed: 3 as const, cost: 1 as const },
  },
];

const TEST_PROVIDERS = [
  { id: "openai" as const, label: "OpenAI" },
  { id: "anthropic" as const, label: "Anthropic" },
];

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));
vi.mock("../../runtime/settings", () => ({
  openSettingsWindow: vi.fn(async () => {}),
}));
vi.mock("../../lib/modelPrefs", () => ({
  toggleFavoriteModel: vi.fn(async () => {}),
  pushRecentModel: vi.fn(async () => {}),
}));
vi.mock("../../../runtime", () => ({
  selectedDefaultModelId: () => "gpt-5.4-mini",
  availableModels: () => TEST_MODELS,
  availableModelProviders: () => TEST_PROVIDERS,
  providerRequiresKey: (id: string) => id !== "openai-compatible",
  isCustomEndpointModel: (id: string) => id.startsWith("compat-"),
  modelIdForCustomEndpoint: (id: string) => `compat-${id}`,
  customEndpointModel: (endpoint: {
    id: string;
    name: string;
    baseURL: string;
    modelId: string;
    contextLimit: number;
  }) => ({
    id: `compat-${endpoint.id}`,
    provider: "openai-compatible",
    label: endpoint.modelId || endpoint.name,
    hint: endpoint.name,
    description: `${endpoint.name} — ${endpoint.baseURL}`,
    capabilities: { intelligence: 3, speed: 3, cost: 3 },
    contextWindow: endpoint.contextLimit,
  }),
  modelProvider: (id: string) =>
    TEST_PROVIDERS.find((provider) => provider.id === id),
}));

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  Popover: ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (
    <div data-testid="popover-root" data-open={String(open)}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    "data-model-browser"?: boolean;
  }) => (
    <div
      data-testid="popover-content"
      data-model-browser={props["data-model-browser"] ? "" : undefined}
    >
      {children}
    </div>
  ),
}));

function keysWith(providers: Record<string, string>) {
  return { ...EMPTY_PROVIDER_KEYS, ...providers };
}

beforeEach(() => {
  useChatStore.setState({
    selectedModelId: "gpt-5.4-mini",
    apiKeys: keysWith({ openai: "sk-test" }),
    setSelectedModelId: vi.fn(),
  });
  usePreferencesStore.setState({
    favoriteModelIds: [],
    recentModelIds: [],
    customEndpoints: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function modelRows() {
  return within(screen.getByTestId("popover-content")).getAllByRole("menuitem");
}

describe("ModelDropdown", () => {
  it("uses a non-modal popover model browser", () => {
    render(<ModelDropdown />);
    expect(screen.getByTestId("popover-root")).toBeInTheDocument();
  });

  it("shows the selected model label in the trigger", () => {
    render(<ModelDropdown />);
    const trigger = within(screen.getByTestId("popover-trigger")).getByRole(
      "button",
    );
    expect(trigger).toHaveTextContent("GPT-5.4 mini");
    expect(trigger).toHaveAttribute("title", "Model: GPT-5.4 mini");
    expect(trigger).toHaveClass("min-w-0", "shrink");
  });

  it("warns in the trigger when the selected model has no key", () => {
    useChatStore.setState({ apiKeys: keysWith({}) });
    render(<ModelDropdown />);
    const trigger = within(screen.getByTestId("popover-trigger")).getByRole(
      "button",
    );
    expect(trigger.title).toMatch(/^GPT-5\.4 mini .* no key configured$/);
    expect(trigger.className).toContain("text-amber-600");
  });

  it("filters models by the search query", () => {
    render(<ModelDropdown />);
    fireEvent.change(screen.getByPlaceholderText(/search by model/i), {
      target: { value: "GPT-5.5 Pro" },
    });
    const rows = modelRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("GPT-5.5 Pro");
  });

  it("supports arrow navigation from search and Enter selection", () => {
    render(<ModelDropdown />);
    const search = screen.getByPlaceholderText(/search by model/i);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const rows = modelRows();
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(rows[0], { key: "Enter" });
    expect(useChatStore.getState().setSelectedModelId).toHaveBeenCalled();
  });

  it("shows an empty message when nothing matches", () => {
    render(<ModelDropdown />);
    fireEvent.change(screen.getByPlaceholderText(/search by model/i), {
      target: { value: "zzz-no-such-model" },
    });
    expect(screen.getByText("No ready models match")).toBeInTheDocument();
    expect(
      screen.getByText(/Try another search or view all models/),
    ).toBeInTheDocument();
  });

  it("clearly labels selectable models as the default scope", () => {
    render(<ModelDropdown />);
    expect(
      screen.getByRole("button", { name: /Ready to use/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /All models/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    for (const row of modelRows()) {
      expect(row).not.toHaveTextContent(/claude/i);
    }
  });

  it("reveals the full model list through an explicit scope tab", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /All models/ }));
    expect(
      modelRows().some((row) => /claude/i.test(row.textContent ?? "")),
    ).toBe(true);
    expect(screen.getByRole("button", { name: /All models/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("filters the catalogue with one compact provider control", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /All models/ }));
    fireEvent.change(screen.getByRole("combobox", { name: /provider/i }), {
      target: { value: "anthropic" },
    });
    for (const row of modelRows()) {
      expect(row).toHaveTextContent(/claude/i);
    }
  });

  it("selects a model from a configured provider", () => {
    render(<ModelDropdown />);
    const row = modelRows().find((r) =>
      r.textContent?.includes("GPT-5.5 Pro"),
    ) as HTMLElement;
    fireEvent.click(row);
    expect(useChatStore.getState().setSelectedModelId).toHaveBeenCalledWith(
      "gpt-5.5-pro",
    );
    expect(openSettingsWindow).not.toHaveBeenCalled();
  });

  it("opens settings instead of selecting an unconfigured provider model", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByRole("button", { name: /All models/ }));
    fireEvent.change(screen.getByPlaceholderText(/search by model/i), {
      target: { value: "Claude Fable 5" },
    });
    const row = modelRows().find((candidate) =>
      /Claude Fable 5/i.test(candidate.textContent ?? ""),
    ) as HTMLElement;
    fireEvent.click(row);
    expect(openSettingsWindow).toHaveBeenCalledWith("models");
    expect(useChatStore.getState().setSelectedModelId).not.toHaveBeenCalled();
  });

  it("keeps search within the selected model scope", () => {
    render(<ModelDropdown />);
    const search = screen.getByPlaceholderText(/search by model/i);
    fireEvent.change(search, { target: { value: "Claude Fable 5" } });
    expect(screen.getByText("No ready models match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /All models/ }));
    expect(modelRows()).toHaveLength(1);
    expect(modelRows()[0]).toHaveTextContent("Claude Fable 5");
  });

  it("toggles a favorite from the row star", () => {
    render(<ModelDropdown />);
    const row = modelRows().find((r) =>
      r.textContent?.includes("GPT-5.5 Pro"),
    ) as HTMLElement;
    fireEvent.click(within(row).getByTitle("Favorite"));
    expect(toggleFavoriteModel).toHaveBeenCalledWith("gpt-5.5-pro");
  });

  it("promotes favorites and recents behind the selected model", () => {
    usePreferencesStore.setState({
      favoriteModelIds: ["gpt-5.5-pro"],
      recentModelIds: ["gpt-5.6-luna"],
    });
    render(<ModelDropdown />);
    const rows = modelRows();
    expect(rows[0]).toHaveTextContent("GPT-5.4 mini");
    expect(rows[1]).toHaveTextContent("GPT-5.5 Pro");
    expect(rows[2]).toHaveTextContent("GPT-5.6 Luna");
  });

  it("lists a custom endpoint among available models", () => {
    usePreferencesStore.setState({
      customEndpoints: [
        {
          id: "ep1",
          name: "My server",
          baseURL: "http://localhost:1234/v1",
          modelId: "llama-local",
          contextLimit: 32_000,
        },
      ],
    });
    render(<ModelDropdown />);
    expect(
      modelRows().some((row) => row.textContent?.includes("llama-local")),
    ).toBe(true);
  });

  it("selects a custom-endpoint model without requiring a key", () => {
    usePreferencesStore.setState({
      customEndpoints: [
        {
          id: "ep1",
          name: "My server",
          baseURL: "http://localhost:1234/v1",
          modelId: "llama-local",
          contextLimit: 32_000,
        },
      ],
    });
    render(<ModelDropdown />);
    const row = modelRows().find((r) =>
      r.textContent?.includes("llama-local"),
    ) as HTMLElement;
    fireEvent.click(row);
    expect(useChatStore.getState().setSelectedModelId).toHaveBeenCalledWith(
      "compat-ep1",
    );
  });

  it("opens provider settings from the quiet footer action", () => {
    render(<ModelDropdown />);
    fireEvent.click(screen.getByRole("button", { name: "Manage providers" }));
    expect(openSettingsWindow).toHaveBeenCalledWith("models");
  });
});

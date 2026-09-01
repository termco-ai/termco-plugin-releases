// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { AgentMeta } from "../../store/chatStore";
import { useChatStore } from "../../store/chatStore";
import { usePreferencesStore } from "../../runtime/preferences";
import type { UIMessage } from "@ai-sdk/react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureSessionRuntime } from "../../../runtime";
import { ContextIndicator } from "./ContextIndicator";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

vi.mock("../../ai-elements/context", () => ({
  Context: ({
    usedTokens,
    maxTokens,
    children,
  }: {
    usedTokens: number;
    maxTokens: number;
    children?: React.ReactNode;
  }) => (
    <div data-testid="context" data-used={usedTokens} data-max={maxTokens}>
      {children}
    </div>
  ),
  ContextTrigger: () => <button type="button">trigger</button>,
  ContextContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ContextContentHeader: () => <div />,
  ContextContentBody: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ContextContentFooter: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

beforeEach(() => {
  configureSessionRuntime({
    preferences: {} as never,
    history: {} as never,
    models: [
      {
        id: "openai",
        label: "OpenAI",
        keyringAccount: "openai-api-key",
        keyPrefix: "sk-",
        consoleUrl: "https://example.invalid",
        keyRequirement: "required",
        kind: "cloud",
        description: "OpenAI models",
        models: [
          {
            id: "gpt-5.4-mini",
            provider: "openai",
            label: "GPT-5.4 mini",
            hint: "Fast",
            description: "Test model",
            capabilities: { intelligence: 4, speed: 4, cost: 4 },
            contextWindow: 400_000,
            pricing: { input: 0.4, output: 1.6, cacheRead: 0.04 },
          },
        ],
      },
      {
        id: "openai-compatible",
        label: "OpenAI Compatible",
        keyringAccount: "openai-compatible-api-key",
        keyPrefix: null,
        consoleUrl: "https://example.invalid",
        keyRequirement: "optional",
        kind: "compatible",
        description: "Custom endpoints",
        models: [],
        defaultContextLimit: 128_000,
        customEndpoint: {
          modelIdPrefix: "compat-",
          keyringAccountPrefix: "compat-",
          keyringAccountSuffix: "-api-key",
          modelIdFor: (id) => `compat-${id}`,
          endpointIdFrom: (id) => id.startsWith("compat-") ? id.slice(7) : null,
          modelFor: (endpoint) => ({
            id: `compat-${endpoint.id}`,
            provider: "openai-compatible",
            label: endpoint.modelId,
            hint: endpoint.name,
            description: endpoint.baseURL,
            capabilities: { intelligence: 3, speed: 3, cost: 3 },
            contextWindow: endpoint.contextLimit,
          }),
        },
      },
    ],
  });
});

function textMessage(chars: number): UIMessage {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text: "x".repeat(chars) }],
  } as unknown as UIMessage;
}

function seedMeta(patch: Partial<AgentMeta>) {
  useChatStore.setState({
    agentMeta: {
      status: "idle",
      step: null,
      approvalsPending: 0,
      error: null,
      tokens: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      lastInputTokens: 0,
      lastCachedTokens: 0,
      lastTokensPerSecond: 0,
      timeToFirstOutputMs: 0,
      hitStepCap: false,
      compacting: null,
      compactionNotice: null,
      ...patch,
    },
  });
}

afterEach(() => {
  cleanup();
  seedMeta({});
  useChatStore.setState({ selectedModelId: "gpt-5.4-mini" });
  usePreferencesStore.setState({
    customEndpoints: [],
  });
});

describe("ContextIndicator", () => {
  it("estimates context from messages before any request was made", () => {
    useChatStore.setState({ selectedModelId: "gpt-5.4-mini" });
    seedMeta({ lastInputTokens: 0 });
    render(<ContextIndicator messages={[textMessage(400)]} />);
    // The exact figure belongs to `lib/tokens`; what matters here is that the
    // meter shows a plausible estimate rather than zero or the raw length.
    const used = Number(
      screen.getByTestId("context").getAttribute("data-used"),
    );
    expect(used).toBeGreaterThan(80);
    expect(used).toBeLessThan(400);
    expect(screen.getByText("Estimated context")).toBeInTheDocument();
    expect(screen.getByText(/Token count is approximate/)).toBeInTheDocument();
  });

  it("prefers the reported last-request input tokens", () => {
    seedMeta({ lastInputTokens: 5000 });
    render(<ContextIndicator messages={[textMessage(400)]} />);
    expect(screen.getByTestId("context")).toHaveAttribute("data-used", "5000");
    expect(screen.getByText("Last request")).toBeInTheDocument();
    expect(screen.getByText("5.0k")).toBeInTheDocument();
    expect(
      screen.getByText(/session totals are cumulative/),
    ).toBeInTheDocument();
  });

  it("shows the model label and its context window", () => {
    useChatStore.setState({ selectedModelId: "gpt-5.4-mini" });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByText("GPT-5.4 mini")).toBeInTheDocument();
    expect(screen.getByTestId("context")).toHaveAttribute("data-max", "400000");
    expect(screen.getByText("400k")).toBeInTheDocument();
  });

  it("falls back to the raw id for models outside the registry", () => {
    useChatStore.setState({ selectedModelId: "compat-unknown" });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByText("compat-unknown")).toBeInTheDocument();
  });

  it("uses the selected endpoint's own context window and switches live", () => {
    usePreferencesStore.setState({
      customEndpoints: [{
        id: "local",
        name: "Test",
        baseURL: "http://localhost:20128/v1",
        modelId: "gh/gpt-5.6-sol",
        contextLimit: 1_000_000,
      }],
    });
    useChatStore.setState({ selectedModelId: "compat-local" });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-max",
      "1000000",
    );
    expect(screen.getByText("gh/gpt-5.6-sol")).toBeInTheDocument();

    act(() => useChatStore.setState({ selectedModelId: "gpt-5.4-mini" }));
    expect(screen.getByTestId("context")).toHaveAttribute("data-max", "400000");

    act(() => useChatStore.setState({ selectedModelId: "compat-local" }));
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-max",
      "1000000",
    );
  });

  it("hides session rows until tokens were reported", () => {
    render(<ContextIndicator messages={[]} />);
    expect(screen.queryByText("Session input")).not.toBeInTheDocument();
    expect(screen.queryByText("Session cost")).not.toBeInTheDocument();
  });

  it("shows cumulative session totals and cost once reported", () => {
    useChatStore.setState({ selectedModelId: "gpt-5.4-mini" });
    seedMeta({
      tokens: {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedInputTokens: 0,
      },
    });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByText("Session input")).toBeInTheDocument();
    expect(screen.getByText("Session output")).toBeInTheDocument();
    expect(screen.getAllByText("1.00M")).toHaveLength(2);
    // 1M in at $0.4/M + 1M out at $1.6/M.
    expect(screen.getByText("Session cost")).toBeInTheDocument();
    expect(screen.getByText("$2.00")).toBeInTheDocument();
    expect(screen.queryByText("Cache hit")).not.toBeInTheDocument();
  });

  it("shows the cache-hit rate when cached input tokens exist", () => {
    seedMeta({
      tokens: {
        inputTokens: 1000,
        outputTokens: 10,
        cachedInputTokens: 500,
      },
    });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByText("Cache hit")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows the cached share of the last request when present", () => {
    seedMeta({ lastInputTokens: 4000, lastCachedTokens: 3000 });
    render(<ContextIndicator messages={[]} />);
    expect(screen.getByText("Of which cached")).toBeInTheDocument();
    expect(screen.getByText("3.0k")).toBeInTheDocument();
  });
});

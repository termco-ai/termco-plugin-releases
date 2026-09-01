// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type {
  AiReasoningEffort as ReasoningEffort,
} from "@termco/ai-models-base";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingToggle } from "./ThinkingToggle";

const state = {
  modelId: "gpt-5.6",
  reasoningByModel: {} as Record<string, ReasoningEffort>,
  showThinking: true,
  setShowThinking: vi.fn(),
};

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => <svg aria-hidden="true" />,
}));
vi.mock("../../store/chatStore", () => ({
  useChatStore: (sel: (s: unknown) => unknown) =>
    sel({ selectedModelId: state.modelId }),
}));
vi.mock("../../runtime/preferences", () => ({
  usePreferencesStore: (sel: (s: unknown) => unknown) =>
    sel({ customEndpoints: [], reasoningByModel: state.reasoningByModel }),
}));
vi.mock("../../lib/modelPrefs", () => ({
  setModelReasoning: vi.fn(async () => {}),
}));
vi.mock("../../lib/transcriptPrefs", () => ({
  useTranscriptPrefs: (sel: (s: unknown) => unknown) => sel(state),
}));
vi.mock("../../../runtime", () => ({
  resolveAvailableModel: (id: string) => ({
    id,
    provider: "openai",
    label: id === "gpt-5.6" ? "GPT-5.6" : "GPT-5.4 mini",
    hint: "Test",
    description: "Test model",
    capabilities: { intelligence: 4, speed: 4, cost: 4 },
    ...(id === "gpt-5.6"
      ? {
          reasoning: {
            levels: ["minimal", "low", "medium", "high", "xhigh"],
            default: "medium",
          },
        }
      : {}),
  }),
  effectiveReasoningEffort: (
    model: { reasoning?: { levels: string[]; default: ReasoningEffort } },
    stored?: ReasoningEffort,
  ) => stored ?? model.reasoning?.default ?? "off",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.modelId = "gpt-5.6";
  state.reasoningByModel = {};
  state.showThinking = true;
});

describe("ThinkingToggle", () => {
  it("explains when the selected model has no adjustable thinking level", () => {
    state.modelId = "gpt-5.4-mini";
    render(<ThinkingToggle />);
    const button = screen.getByRole("button", {
      name: "Thinking level: Unavailable",
    });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("title", "Thinking level: Unavailable");
    expect(button).toHaveAttribute("data-thinking-level", "unavailable");
    expect(button.querySelector("[data-thinking-fill]")).toHaveAttribute(
      "data-thinking-fill",
      "0",
    );
  });

  it("shows the model's default effort for a reasoning model", () => {
    // OpenAI reasoning baseline default = medium.
    render(<ThinkingToggle />);
    const button = screen.getByRole("button", {
      name: "Thinking level: Medium",
    });
    expect(button).toHaveAttribute("title", "Thinking level: Medium");
    expect(button).toHaveAttribute("data-thinking-level", "medium");
    expect(button.querySelector("[data-thinking-fill]")).toHaveAttribute(
      "data-thinking-fill",
      "55",
    );
  });

  it("reflects a stored per-model level", () => {
    state.reasoningByModel = { "gpt-5.6": "high" };
    render(<ThinkingToggle />);
    expect(
      screen.getByRole("button", { name: "Thinking level: High" }),
    ).toHaveAttribute("data-thinking-level", "high");
  });

  it("renders an empty brain when thinking is off", () => {
    state.reasoningByModel = { "gpt-5.6": "off" };
    render(<ThinkingToggle />);
    const button = screen.getByRole("button", {
      name: "Thinking level: Off",
    });
    expect(button).toHaveAttribute("title", "Thinking level: Off");
    expect(button.querySelector("[data-thinking-fill]")).toHaveAttribute(
      "data-thinking-fill",
      "0",
    );
  });

  it("keeps transcript visibility inside the same thinking menu", () => {
    render(<ThinkingToggle />);
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Thinking level: Medium" }),
      { button: 0, pointerType: "mouse" },
    );

    const displayPreference = screen.getByRole("menuitemcheckbox", {
      name: /Show thinking in transcript/,
    });
    expect(displayPreference).toHaveAttribute("data-state", "checked");

    fireEvent.click(displayPreference);
    expect(state.setShowThinking).toHaveBeenCalledWith(false);
  });
});

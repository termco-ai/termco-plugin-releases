// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Context,
  ContextCacheUsage,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "./context";

afterEach(cleanup);

const usage = {
  inputTokens: 1200,
  inputTokenDetails: {
    noCacheTokens: 400,
    cacheReadTokens: 800,
    cacheWriteTokens: undefined,
  },
  outputTokens: 300,
  outputTokenDetails: {
    textTokens: 250,
    reasoningTokens: 50,
  },
  totalTokens: 1500,
  reasoningTokens: 50,
  cachedInputTokens: 800,
};

describe("Context provider", () => {
  it("throws when subcomponents are used outside Context", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<ContextTrigger />)).toThrow(
      "Context components must be used within Context",
    );
    spy.mockRestore();
  });
});

describe("ContextTrigger", () => {
  it("renders the used percentage and usage icon by default", () => {
    render(
      <Context usedTokens={500} maxTokens={1000}>
        <ContextTrigger />
      </Context>,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByLabelText("Model context usage")).toBeInTheDocument();
  });

  it("renders custom children instead of the default button", () => {
    render(
      <Context usedTokens={500} maxTokens={1000}>
        <ContextTrigger>
          <button type="button">custom trigger</button>
        </ContextTrigger>
      </Context>,
    );
    expect(screen.getByText("custom trigger")).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });
});

describe("ContextContentHeader", () => {
  it("shows percentage, compact counts and a progress bar", () => {
    const { container } = render(
      <Context usedTokens={250} maxTokens={1000}>
        <ContextContentHeader />
      </Context>,
    );
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("250 / 1K")).toBeInTheDocument();
    const indicator = container.querySelector(
      "[data-slot=progress-indicator]",
    ) as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-75%)");
  });

  it("prefers custom children", () => {
    render(
      <Context usedTokens={250} maxTokens={1000}>
        <ContextContentHeader>override</ContextContentHeader>
      </Context>,
    );
    expect(screen.getByText("override")).toBeInTheDocument();
    expect(screen.queryByText("25%")).not.toBeInTheDocument();
  });
});

describe("Context content sections", () => {
  it("renders body and footer children", () => {
    render(
      <Context usedTokens={1} maxTokens={2}>
        <ContextContentBody>body text</ContextContentBody>
        <ContextContentFooter>footer text</ContextContentFooter>
      </Context>,
    );
    expect(screen.getByText("body text")).toBeInTheDocument();
    expect(screen.getByText("footer text")).toBeInTheDocument();
  });
});

describe("usage rows", () => {
  it("renders compact token counts per category", () => {
    render(
      <Context usedTokens={1} maxTokens={2} usage={usage}>
        <ContextInputUsage />
        <ContextOutputUsage />
        <ContextReasoningUsage />
        <ContextCacheUsage />
      </Context>,
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("1.2K")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("Cache")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("renders nothing when a category is zero or usage is missing", () => {
    const { container } = render(
      <Context usedTokens={1} maxTokens={2}>
        <ContextInputUsage />
        <ContextOutputUsage />
        <ContextReasoningUsage />
        <ContextCacheUsage />
      </Context>,
    );
    expect(container.textContent).toBe("");
  });

  it("prefers custom children over the default row", () => {
    render(
      <Context usedTokens={1} maxTokens={2} usage={usage}>
        <ContextInputUsage>custom input</ContextInputUsage>
      </Context>,
    );
    expect(screen.getByText("custom input")).toBeInTheDocument();
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
  });
});

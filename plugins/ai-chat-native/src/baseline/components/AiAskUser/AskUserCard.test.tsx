// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";
import { type AnyAskUserPart, AskUserCard } from "./AskUserCard";

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());
afterEach(cleanup);

const QUESTION = {
  question: "Where does the session state live?",
  context: "Everything downstream depends on this.",
  options: [
    {
      label: "Zustand store",
      description: "In memory, gone on reload",
      recommended: true,
    },
    { label: "On disk per session" },
  ],
  topic: "Grilling the plan",
};

function part(
  state: string,
  input: unknown = QUESTION,
  output?: unknown,
): AnyAskUserPart {
  return {
    type: "tool-ask_user",
    toolCallId: "q1",
    state,
    input,
    output,
  } as unknown as AnyAskUserPart;
}

describe("AskUserCard — open question", () => {
  it("shows the topic, question, context and options", () => {
    render(<AskUserCard part={part("input-available")} onAnswer={vi.fn()} />);
    expect(screen.getByText("Grilling the plan")).toBeInTheDocument();
    expect(screen.getByText(QUESTION.question)).toBeInTheDocument();
    expect(screen.getByText(QUESTION.context)).toBeInTheDocument();
    expect(screen.getByText("Zustand store")).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });

  it("keeps Answer disabled until something is chosen", () => {
    render(<AskUserCard part={part("input-available")} onAnswer={vi.fn()} />);
    const answer = screen.getByRole("button", { name: /Answer/ });
    expect(answer).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Zustand store/ }));
    expect(answer).toBeEnabled();
  });

  it("answers with the chosen option", () => {
    const onAnswer = vi.fn();
    render(<AskUserCard part={part("input-available")} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Zustand store/ }));
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
    expect(onAnswer).toHaveBeenCalledWith("q1", {
      answer: "Zustand store",
      selected: ["Zustand store"],
      freeText: undefined,
    });
  });

  it("answers with free text when no option is picked", () => {
    const onAnswer = vi.fn();
    render(<AskUserCard part={part("input-available")} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText("Your own answer"), {
      target: { value: "  neither, use a ref  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
    expect(onAnswer).toHaveBeenCalledWith("q1", {
      answer: "neither, use a ref",
      selected: undefined,
      freeText: true,
    });
  });

  it("combines an option with a free-text qualifier", () => {
    const onAnswer = vi.fn();
    render(<AskUserCard part={part("input-available")} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Zustand store/ }));
    fireEvent.change(screen.getByLabelText("Your own answer"), {
      target: { value: "but persist the log" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
    expect(onAnswer).toHaveBeenCalledWith("q1", {
      answer: "Zustand store — but persist the log",
      selected: ["Zustand store"],
      freeText: undefined,
    });
  });

  it("selects a single option at a time, and toggles it off", () => {
    render(<AskUserCard part={part("input-available")} onAnswer={vi.fn()} />);
    const first = screen.getByRole("button", { name: /Zustand store/ });
    const second = screen.getByRole("button", { name: /On disk/ });
    fireEvent.click(first);
    fireEvent.click(second);
    expect(first).toHaveAttribute("aria-pressed", "false");
    expect(second).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(second);
    expect(second).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps several options when multiSelect is set", () => {
    const onAnswer = vi.fn();
    render(
      <AskUserCard
        part={part("input-available", { ...QUESTION, multiSelect: true })}
        onAnswer={onAnswer}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Zustand store/ }));
    fireEvent.click(screen.getByRole("button", { name: /On disk/ }));
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
    expect(onAnswer.mock.calls[0]?.[1].selected).toEqual([
      "Zustand store",
      "On disk per session",
    ]);
  });

  it("hides the free-text field when the model disallows it", () => {
    render(
      <AskUserCard
        part={part("input-available", { ...QUESTION, allowFreeText: false })}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("Your own answer")).not.toBeInTheDocument();
  });

  it("reports Skip and End session distinctly", () => {
    const onAnswer = vi.fn();
    render(<AskUserCard part={part("input-available")} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(onAnswer.mock.calls[0]?.[1].skipped).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /End session/ }));
    expect(onAnswer.mock.calls[1]?.[1].stopped).toBe(true);
  });
});

describe("AskUserCard — keyboard", () => {
  it("picks an option by number and answers with ⌘↩", () => {
    const onAnswer = vi.fn();
    render(<AskUserCard part={part("input-available")} onAnswer={onAnswer} />);
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByRole("button", { name: /On disk/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    expect(onAnswer.mock.calls[0]?.[1].answer).toBe("On disk per session");
  });

  it("leaves digits alone while the user is typing", () => {
    render(<AskUserCard part={part("input-available")} onAnswer={vi.fn()} />);
    const field = screen.getByLabelText("Your own answer");
    fireEvent.keyDown(field, { key: "2" });
    expect(screen.getByRole("button", { name: /On disk/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("ignores a digit beyond the option list", () => {
    render(<AskUserCard part={part("input-available")} onAnswer={vi.fn()} />);
    fireEvent.keyDown(window, { key: "5" });
    expect(screen.getByRole("button", { name: /Answer/ })).toBeDisabled();
  });
});

describe("AskUserCard — other states", () => {
  it("never shows a half-streamed question", () => {
    render(
      <AskUserCard
        part={part("input-streaming", { question: "Where does the ses" })}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.getByText("Preparing a question…")).toBeInTheDocument();
    expect(screen.queryByText(/Where does the ses/)).not.toBeInTheDocument();
  });

  it("shows the decision once answered", () => {
    render(
      <AskUserCard
        part={part("output-available", QUESTION, {
          answer: "Zustand store",
          selected: ["Zustand store"],
        })}
        onAnswer={vi.fn()}
      />,
    );
    expect(screen.getByTestId("ask-user-answered")).toBeInTheDocument();
    expect(screen.getByText("Zustand store")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Answer/ }),
    ).not.toBeInTheDocument();
  });

  // Regression: the AI SDK mutates its tool part in place and only then hands
  // React a clone. A memo comparator reading `a.part.state` therefore sees the
  // NEW state on both sides and bails out — the card froze on "Preparing a
  // question…" forever. This models that exact sequence.
  it("updates when the SDK mutates the part it already handed us", () => {
    const live = {
      type: "tool-ask_user",
      toolCallId: "q1",
      state: "input-streaming",
      input: { question: "Where does the ses" },
    } as unknown as AnyAskUserPart & {
      state: string;
      input: Record<string, unknown>;
    };
    const onAnswer = vi.fn();
    const { rerender } = render(
      <AskUserCard part={live} onAnswer={onAnswer} />,
    );
    expect(screen.getByText("Preparing a question…")).toBeInTheDocument();

    // The SDK mutates the very object React is holding as previous props …
    live.state = "input-available";
    live.input = QUESTION as unknown as Record<string, unknown>;
    // … and then re-renders with a clone of it.
    rerender(
      <AskUserCard
        part={{ ...live } as unknown as AnyAskUserPart}
        onAnswer={onAnswer}
      />,
    );

    expect(screen.queryByText("Preparing a question…")).not.toBeInTheDocument();
    expect(screen.getByText(QUESTION.question)).toBeInTheDocument();
  });

  it("renders read-only without an answer callback", () => {
    render(<AskUserCard part={part("input-available")} />);
    expect(screen.getByRole("button", { name: /Answer/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeDisabled();
  });
});

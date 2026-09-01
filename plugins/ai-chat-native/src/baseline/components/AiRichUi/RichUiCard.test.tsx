// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";

const openFileFromBlock = vi.hoisted(() => vi.fn());
vi.mock("../../runtime/navigation", () => ({
  openFileFromBlock,
}));
// recharts needs layout; the chart view is lazy and not under test here.
vi.mock("./ChartView", () => ({ default: () => <div data-testid="chart" /> }));

import { type AnyRichUiPart, RichUiCard } from "./RichUiCard";

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());

afterEach(() => {
  cleanup();
  openFileFromBlock.mockClear();
});

const FINDINGS = {
  kind: "findings",
  title: "Review",
  items: [
    { severity: "info", message: "Consider extracting this" },
    {
      severity: "error",
      message: "Race condition",
      detail: "Fires too early.",
      ref: { file: "src/deep/path/autoSend.ts", line: 24 },
    },
  ],
};

function part(
  state: string,
  input: unknown,
  output?: unknown,
  type = "tool-show_ui",
): AnyRichUiPart {
  return {
    type,
    toolCallId: "v1",
    state,
    input,
    output,
  } as unknown as AnyRichUiPart;
}

describe("RichUiCard — display", () => {
  it("renders a findings view worst-first with its location", () => {
    render(
      <RichUiCard
        part={part("output-available", { view: FINDINGS })}
        interactive={false}
      />,
    );
    expect(screen.getByTestId("rich-ui-card")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    // The error sorts above the info item.
    const rows = screen.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Race condition");
    // The location is shortened, with the full path one hover away.
    const loc = screen.getByText("autoSend.ts:24");
    expect(loc).toHaveAttribute("title", "src/deep/path/autoSend.ts:24");
  });

  it("opens the file at the line when a row is clicked", () => {
    render(
      <RichUiCard
        part={part("output-available", { view: FINDINGS })}
        interactive={false}
      />,
    );
    fireEvent.click(screen.getByText("Race condition"));
    expect(openFileFromBlock).toHaveBeenCalledWith(
      "src/deep/path/autoSend.ts",
      24,
      undefined,
    );
  });

  it("leaves a row without a location inert", () => {
    render(
      <RichUiCard
        part={part("output-available", { view: FINDINGS })}
        interactive={false}
      />,
    );
    fireEvent.click(screen.getByText("Consider extracting this"));
    expect(openFileFromBlock).not.toHaveBeenCalled();
  });

  it("sorts a table by a clicked column", () => {
    const view = {
      kind: "table",
      columns: [
        { key: "port", label: "Port" },
        { key: "proc", label: "Process" },
      ],
      rows: [
        { cells: { port: 5173, proc: "vite" } },
        { cells: { port: 3000, proc: "node" } },
      ],
    };
    render(
      <RichUiCard
        part={part("output-available", { view })}
        interactive={false}
      />,
    );
    const firstCell = () => screen.getAllByRole("cell")[0];
    expect(firstCell()).toHaveTextContent("5173");
    fireEvent.click(screen.getByText("Port"));
    expect(firstCell()).toHaveTextContent("3000");
  });

  it("never shows a half-streamed view", () => {
    render(
      <RichUiCard
        part={part("input-streaming", { view: { kind: "findings" } })}
        interactive={false}
      />,
    );
    expect(screen.getByText("Preparing a view…")).toBeInTheDocument();
    expect(screen.queryByTestId("rich-ui-card")).not.toBeInTheDocument();
  });

  it("shows a placeholder rather than a broken view for invalid input", () => {
    render(
      <RichUiCard
        part={part("output-available", { view: { kind: "pie" } })}
        interactive={false}
      />,
    );
    expect(screen.getByText("Preparing a view…")).toBeInTheDocument();
  });
});

describe("RichUiCard — interactive", () => {
  const askInput = {
    view: { kind: "cards", items: [{ title: "Option A" }] },
    question: "Which way?",
    actions: [
      { id: "apply", label: "Apply", recommended: true },
      { id: "skip", label: "Skip" },
    ],
  };

  it("reports the chosen action with its note", () => {
    const onRespond = vi.fn();
    render(
      <RichUiCard
        part={part("input-available", askInput, undefined, "tool-ask_ui")}
        interactive
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("Which way?")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Your note"), {
      target: { value: "but only the first" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onRespond).toHaveBeenCalledWith("v1", {
      actionId: "apply",
      label: "Apply",
      note: "but only the first",
      selected: undefined,
      dismissed: undefined,
    });
  });

  it("reports a dismissal distinctly", () => {
    const onRespond = vi.fn();
    render(
      <RichUiCard
        part={part("input-available", askInput, undefined, "tool-ask_ui")}
        interactive
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(onRespond.mock.calls[0]?.[1].dismissed).toBe(true);
  });

  it("returns the ticked items when the view is selectable", () => {
    const onRespond = vi.fn();
    render(
      <RichUiCard
        part={part(
          "input-available",
          { ...askInput, selectable: true },
          undefined,
          "tool-ask_ui",
        )}
        interactive
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByLabelText("Select Option A"));
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(onRespond.mock.calls[0]?.[1].selected).toEqual(["Option A"]);
  });

  it("shows the decision once answered", () => {
    render(
      <RichUiCard
        part={part(
          "output-available",
          askInput,
          { actionId: "apply", label: "Apply" },
          "tool-ask_ui",
        )}
        interactive
        onRespond={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: /Dismiss/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Apply")).toBeInTheDocument();
  });

  it("renders read-only without a respond callback", () => {
    render(
      <RichUiCard
        part={part("input-available", askInput, undefined, "tool-ask_ui")}
        interactive
      />,
    );
    expect(screen.getByRole("button", { name: /Apply/ })).toBeDisabled();
  });

  it("waits for at least one usable action before showing the card", () => {
    render(
      <RichUiCard
        part={part(
          "input-available",
          { view: askInput.view, actions: [] },
          undefined,
          "tool-ask_ui",
        )}
        interactive
      />,
    );
    expect(screen.getByText("Preparing a choice…")).toBeInTheDocument();
  });
});

// Regression: the SDK mutates its tool part in place and only THEN hands React
// a clone. A memo comparator reading `a.part.state` sees the new value on both
// sides and freezes the card — this is the incident from `AskUserCard`.
describe("RichUiCard — SDK part mutation", () => {
  it("updates when the part it was given is mutated underneath", () => {
    const live = {
      type: "tool-show_ui",
      toolCallId: "v1",
      state: "input-streaming",
      input: { view: { kind: "findings" } },
    } as unknown as AnyRichUiPart & { state: string; input: unknown };

    const { rerender } = render(<RichUiCard part={live} interactive={false} />);
    expect(screen.getByText("Preparing a view…")).toBeInTheDocument();

    live.state = "output-available";
    live.input = { view: FINDINGS };
    rerender(
      <RichUiCard
        part={{ ...live } as unknown as AnyRichUiPart}
        interactive={false}
      />,
    );

    expect(screen.queryByText("Preparing a view…")).not.toBeInTheDocument();
    expect(screen.getByText("Race condition")).toBeInTheDocument();
  });
});

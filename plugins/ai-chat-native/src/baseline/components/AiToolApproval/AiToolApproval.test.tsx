// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ToolUIPart } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiToolApproval } from "./AiToolApproval";

const mocks = vi.hoisted(() => ({
  focusInput: vi.fn(),
}));

vi.mock("../../store/chatStore", () => ({
  useChatStore: (
    selector: (state: { focusInput: typeof mocks.focusInput }) => unknown,
  ) => selector({ focusInput: mocks.focusInput }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.focusInput.mockClear();
});

type ApprovalPart = Extract<ToolUIPart, { state: "approval-requested" }>;

function makePart(over: Partial<Record<string, unknown>> = {}): ApprovalPart {
  return {
    type: "tool-write_file",
    toolCallId: "tc1",
    state: "approval-requested",
    approval: { id: "ap1" },
    input: { path: "/proj/a.ts", content: "x" },
    ...over,
  } as unknown as ApprovalPart;
}

describe("AiToolApproval", () => {
  it("renders the registry label for known tools", () => {
    render(
      <AiToolApproval
        part={makePart()}
        toolName="write_file"
        onRespond={() => {}}
      />,
    );
    expect(screen.getByText("Write file")).toBeInTheDocument();
    expect(screen.getByText("Review required")).toBeInTheDocument();
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("falls back to the raw tool name for unknown tools", () => {
    render(
      <AiToolApproval
        part={makePart()}
        toolName="custom_tool"
        onRespond={() => {}}
      />,
    );
    expect(screen.getByText("custom_tool")).toBeInTheDocument();
  });

  it("responds true on Approve and false on Don't allow", () => {
    const onRespond = vi.fn();
    render(
      <AiToolApproval
        part={makePart()}
        toolName="write_file"
        onRespond={onRespond}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(onRespond).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /Don’t allow/ }));
    expect(onRespond).toHaveBeenLastCalledWith(false);
  });

  it("renders the per-tool preview from the part input", () => {
    render(
      <AiToolApproval
        part={makePart()}
        toolName="write_file"
        onRespond={() => {}}
      />,
    );
    expect(screen.getByText("/proj/a.ts")).toBeInTheDocument();
  });

  it("does not re-render for the same approval id when input changes", () => {
    const onRespond = vi.fn();
    const { rerender } = render(
      <AiToolApproval
        part={makePart()}
        toolName="write_file"
        onRespond={onRespond}
      />,
    );
    rerender(
      <AiToolApproval
        part={makePart({ input: { path: "/other.ts", content: "y" } })}
        toolName="write_file"
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("/proj/a.ts")).toBeInTheDocument();
    expect(screen.queryByText("/other.ts")).not.toBeInTheDocument();
  });

  it("renders a plan panel with Build/Revise for ExitPlanMode", () => {
    const onRespond = vi.fn();
    render(
      <AiToolApproval
        part={makePart({
          type: "tool-ExitPlanMode",
          approval: { id: "plan1" },
          input: { plan: "1. do thing\n2. do other thing" },
        })}
        toolName="ExitPlanMode"
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("Plan ready")).toBeInTheDocument();
    expect(screen.getByText(/do other thing/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Build it/ }));
    expect(onRespond).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: /Revise/ }));
    expect(onRespond).toHaveBeenLastCalledWith(false);
  });

  it("⌘↩ approves the plan", () => {
    const onRespond = vi.fn();
    render(
      <AiToolApproval
        part={makePart({
          type: "tool-ExitPlanMode",
          approval: { id: "plan2" },
          input: { plan: "the plan" },
        })}
        toolName="ExitPlanMode"
        onRespond={onRespond}
      />,
    );
    fireEvent.keyDown(window, { key: "Enter", metaKey: true });
    expect(onRespond).toHaveBeenLastCalledWith(true);
  });

  it("selects question answers and routes them to the composer", () => {
    const onRespond = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(
      <AiToolApproval
        part={makePart({
          type: "tool-AskUserQuestion",
          approval: { id: "q1" },
          input: {
            questions: [
              {
                question: "Which database?",
                options: [
                  { label: "Postgres", description: "relational" },
                  { label: "Mongo" },
                ],
              },
            ],
          },
        })}
        toolName="AskUserQuestion"
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("Agent has a question")).toBeInTheDocument();
    expect(screen.getByText("Which database?")).toBeInTheDocument();
    const postgres = screen.getByRole("button", { name: /Postgres/ });
    fireEvent.click(postgres);
    expect(postgres).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Mongo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer in composer" }));
    expect(onRespond).toHaveBeenCalledWith(false);
    expect(mocks.focusInput).toHaveBeenCalledWith("Postgres");
  });

  it("re-renders when the approval id changes", () => {
    const onRespond = vi.fn();
    const { rerender } = render(
      <AiToolApproval
        part={makePart()}
        toolName="write_file"
        onRespond={onRespond}
      />,
    );
    rerender(
      <AiToolApproval
        part={makePart({
          approval: { id: "ap2" },
          input: { path: "/other.ts", content: "y" },
        })}
        toolName="write_file"
        onRespond={onRespond}
      />,
    );
    expect(screen.getByText("/other.ts")).toBeInTheDocument();
  });
});

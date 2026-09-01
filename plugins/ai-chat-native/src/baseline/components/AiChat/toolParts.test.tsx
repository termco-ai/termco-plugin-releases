// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";
import type { AnyPart } from "./partGroups";

vi.mock("../../ai-elements/message", () => ({
  MessageResponse: ({
    streaming,
    children,
  }: {
    streaming?: boolean;
    children?: React.ReactNode;
  }) => (
    <div data-testid="response" data-streaming={String(Boolean(streaming))}>
      {children}
    </div>
  ),
}));

vi.mock("../../ai-elements/reasoning", () => ({
  Reasoning: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reasoning">{children}</div>
  ),
  ReasoningTrigger: () => <div data-testid="reasoning-trigger" />,
  ReasoningContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="reasoning-content">{children}</div>
  ),
}));

vi.mock("../../ai-elements/tool", () => ({
  Tool: ({
    toolName,
    state,
    defaultOpen,
  }: {
    toolName: string;
    state: string;
    defaultOpen?: boolean;
  }) => (
    <div
      data-testid="tool"
      data-tool-name={toolName}
      data-state={state}
      data-default-open={String(Boolean(defaultOpen))}
    />
  ),
}));

import { ReadGroup, ReadRow, RenderedPart } from "./toolParts";

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());
afterEach(cleanup);

function readPart(
  id: string,
  path: string,
  state = "output-available",
): AnyPart {
  return {
    type: "tool-read_file",
    toolCallId: id,
    state,
    input: { path },
  } as unknown as AnyPart;
}

describe("ReadGroup", () => {
  it("shows a deduped count and basename preview", () => {
    render(
      <ReadGroup
        parts={[
          readPart("t1", "/proj/src/a.ts"),
          readPart("t2", "/proj/src/b.ts"),
          readPart("t3", "/proj/src/a.ts"),
        ]}
      />,
    );
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText("· a.ts, b.ts")).toBeInTheDocument();
  });

  it("expands to list full paths on click", () => {
    render(
      <ReadGroup
        parts={[readPart("t1", "/proj/a.ts"), readPart("t2", "/proj/b.ts")]}
      />,
    );
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("/proj/a.ts");
  });

  it("falls back to the part count when no paths are available", () => {
    const noPath = {
      type: "tool-read_file",
      toolCallId: "t1",
      state: "input-streaming",
      input: {},
    } as unknown as AnyPart;
    render(<ReadGroup parts={[noPath, noPath]} />);
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.queryByText(/^·/)).not.toBeInTheDocument();
  });

  it("uses singular wording for a single path", () => {
    render(<ReadGroup parts={[readPart("t1", "/proj/a.ts")]} />);
    expect(screen.getByText("1 file")).toBeInTheDocument();
  });
});

describe("ReadRow", () => {
  it("renders the read path", () => {
    render(<ReadRow part={readPart("t1", "/proj/x.ts")} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("/proj/x.ts")).toBeInTheDocument();
  });

  it("marks errored reads with a destructive dot", () => {
    const { container } = render(
      <ReadRow part={readPart("t1", "/proj/x.ts", "output-error")} />,
    );
    expect(container.querySelector(".bg-destructive")).toBeInTheDocument();
  });

  it("renders a neutral dot for successful reads", () => {
    const { container } = render(
      <ReadRow part={readPart("t1", "/proj/x.ts")} />,
    );
    expect(container.querySelector(".bg-destructive")).not.toBeInTheDocument();
  });
});

describe("RenderedPart", () => {
  const onApproval = vi.fn();

  it("renders text parts through MessageResponse with the streaming flag", () => {
    render(
      <RenderedPart
        part={{ type: "text", text: "hello" } as unknown as AnyPart}
        onApproval={onApproval}
        streaming={true}
      />,
    );
    const el = screen.getByTestId("response");
    expect(el).toHaveTextContent("hello");
    expect(el).toHaveAttribute("data-streaming", "true");
  });

  it("renders reasoning parts", () => {
    render(
      <RenderedPart
        part={{ type: "reasoning", text: "thinking" } as unknown as AnyPart}
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(screen.getByTestId("reasoning-content")).toHaveTextContent(
      "thinking",
    );
  });

  it("renders tool parts with the stripped tool name", () => {
    render(
      <RenderedPart
        part={
          {
            type: "tool-fs_grep",
            toolCallId: "t1",
            state: "output-available",
            input: {},
            output: "res",
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    const tool = screen.getByTestId("tool");
    expect(tool).toHaveAttribute("data-tool-name", "fs_grep");
    expect(tool).toHaveAttribute("data-default-open", "false");
  });

  it("opens list_directory tools by default", () => {
    render(
      <RenderedPart
        part={
          {
            type: "tool-list_directory",
            toolCallId: "t1",
            state: "output-available",
            input: {},
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(screen.getByTestId("tool")).toHaveAttribute(
      "data-default-open",
      "true",
    );
  });

  it("uses toolName from dynamic-tool parts", () => {
    render(
      <RenderedPart
        part={
          {
            type: "dynamic-tool",
            toolName: "mcp_search",
            toolCallId: "t1",
            state: "output-available",
            input: {},
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(screen.getByTestId("tool")).toHaveAttribute(
      "data-tool-name",
      "mcp_search",
    );
  });

  it("routes approval-requested tools to the approval card", () => {
    render(
      <RenderedPart
        part={
          {
            type: "tool-write_file",
            toolCallId: "t1",
            state: "approval-requested",
            approval: { id: "ap-7" },
            input: { path: "/p", content: "c" },
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(screen.getByText("Review required")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(onApproval).toHaveBeenCalledWith("ap-7", true, undefined);
  });

  it("allowRemember shows Always allow, sending always=true", () => {
    render(
      <RenderedPart
        allowRemember
        part={
          {
            type: "tool-write_file",
            toolCallId: "t2",
            state: "approval-requested",
            approval: { id: "ap-8" },
            input: { path: "/p", content: "c" },
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Always allow/ }));
    expect(onApproval).toHaveBeenCalledWith("ap-8", true, true);
  });

  it("routes ask_user to the question card, not the generic tool row", () => {
    const onAnswerQuestion = vi.fn();
    render(
      <RenderedPart
        part={
          {
            type: "tool-ask_user",
            toolCallId: "q1",
            state: "input-available",
            input: { question: "Which way?", options: [{ label: "Left" }] },
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        onAnswerQuestion={onAnswerQuestion}
        streaming={false}
      />,
    );
    expect(screen.queryByTestId("tool")).not.toBeInTheDocument();
    expect(screen.getByTestId("ask-user-card")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Left/ }));
    fireEvent.click(screen.getByRole("button", { name: /Answer/ }));
    expect(onAnswerQuestion).toHaveBeenCalledWith("ask_user", "q1", {
      answer: "Left",
      selected: ["Left"],
      freeText: undefined,
    });
  });

  it("keeps a streaming ask_user off the generic tool row too", () => {
    render(
      <RenderedPart
        part={
          {
            type: "tool-ask_user",
            toolCallId: "q2",
            state: "input-streaming",
            input: { question: "Which w" },
          } as unknown as AnyPart
        }
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(screen.queryByTestId("tool")).not.toBeInTheDocument();
    expect(screen.getByText("Preparing a question…")).toBeInTheDocument();
  });

  it("renders nothing for unknown part types", () => {
    const { container } = render(
      <RenderedPart
        part={{ type: "step-start" } as unknown as AnyPart}
        onApproval={onApproval}
        streaming={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

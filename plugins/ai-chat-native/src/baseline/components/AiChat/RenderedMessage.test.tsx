// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai-elements/message", () => ({
  Message: ({
    from,
    children,
  }: {
    from: string;
    children?: React.ReactNode;
  }) => (
    <div data-testid="message" data-from={from}>
      {children}
    </div>
  ),
  MessageContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
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
  ReasoningTrigger: () => null,
  ReasoningContent: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("../../ai-elements/tool", () => ({
  Tool: ({ toolName }: { toolName: string }) => (
    <div data-testid="tool" data-tool-name={toolName} />
  ),
}));

vi.mock("../../lib/slashCommands", async () => {
  return await import("../../lib/slashCommands/registry");
});

import { RenderedMessage } from "./RenderedMessage";

afterEach(cleanup);

const noop = () => {};

function msg(
  role: UIMessage["role"],
  parts: Record<string, unknown>[],
  id = "m1",
): UIMessage {
  return { id, role, parts } as unknown as UIMessage;
}

function readPart(id: string, path: string): Record<string, unknown> {
  return {
    type: "tool-read_file",
    toolCallId: id,
    state: "output-available",
    input: { path },
  };
}

describe("RenderedMessage - user messages", () => {
  it("renders plain text", () => {
    render(
      <RenderedMessage
        message={msg("user", [{ type: "text", text: "hi there" }])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("hi there")).toBeInTheDocument();
    expect(screen.getByTestId("message")).toHaveAttribute("data-from", "user");
  });

  it("surfaces a command pill and strips the marker from the text", () => {
    render(
      <RenderedMessage
        message={msg("user", [
          {
            type: "text",
            text: '<termco-command name="init" />\n\nset up the repo',
          },
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("/init")).toBeInTheDocument();
    expect(screen.getByText("Initialize workspace")).toBeInTheDocument();
    expect(screen.getByText("set up the repo")).toBeInTheDocument();
    expect(screen.queryByText(/termco-command/)).not.toBeInTheDocument();
  });

  it("renders context chips instead of raw context blocks", () => {
    render(
      <RenderedMessage
        message={msg("user", [
          {
            type: "text",
            text:
              '<selection source="terminal">\nerr line\n</selection>' +
              "what happened?",
          },
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("Terminal selection")).toBeInTheDocument();
    expect(screen.getByText("what happened?")).toBeInTheDocument();
    expect(screen.queryByText("err line")).not.toBeInTheDocument();
  });

  it("renders an attached image chip and strips the page-element block", () => {
    const { container } = render(
      <RenderedMessage
        message={msg("user", [
          {
            type: "text",
            text: '<page-element name="Page element">\nSign in\n</page-element>\n\nwhat this?',
          },
          {
            type: "file",
            mediaType: "image/png",
            url: "data:image/png;base64,AAAA",
            filename: "Page element",
          },
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    // Decorative thumbnail (alt="") beside the label — same chip as the composer.
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img?.src).toBe("data:image/png;base64,AAAA");
    expect(screen.getByText("Page element")).toBeInTheDocument();
    expect(screen.getByText("what this?")).toBeInTheDocument();
    expect(screen.queryByText(/page-element/)).not.toBeInTheDocument();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
  });

  it("omits the paragraph when only context blocks remain", () => {
    const { container } = render(
      <RenderedMessage
        message={msg("user", [
          {
            type: "text",
            text: '<file name="a.ts">\ncontent\n</file>',
          },
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(container.querySelector("p")).not.toBeInTheDocument();
    expect(screen.getByText("a.ts")).toBeInTheDocument();
  });
});

describe("RenderedMessage - hook order", () => {
  it("survives a role flip at the same tree position", () => {
    const { rerender } = render(
      <RenderedMessage
        message={msg("assistant", [{ type: "text", text: "hello" }])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(() =>
      rerender(
        <RenderedMessage
          message={msg("user", [{ type: "text", text: "hi" }])}
          onApproval={noop}
          streaming={false}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText("hi")).toBeInTheDocument();
  });
});

describe("RenderedMessage - assistant messages", () => {
  it("collapses consecutive reads into a read group", () => {
    render(
      <RenderedMessage
        message={msg("assistant", [
          readPart("t1", "/proj/a.ts"),
          readPart("t2", "/proj/b.ts"),
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  it("renders a lone read as a compact row", () => {
    render(
      <RenderedMessage
        message={msg("assistant", [
          { type: "text", text: "checking" },
          readPart("t1", "/proj/a.ts"),
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("/proj/a.ts")).toBeInTheDocument();
    expect(screen.queryByText(/files?$/)).not.toBeInTheDocument();
  });

  it("marks only the trailing text part as streaming", () => {
    render(
      <RenderedMessage
        message={msg("assistant", [
          { type: "text", text: "first" },
          { type: "tool-fs_grep", toolCallId: "t1", state: "output-available" },
          { type: "text", text: "second" },
        ])}
        onApproval={noop}
        streaming={true}
      />,
    );
    const responses = screen.getAllByTestId("response");
    expect(responses[0]).toHaveAttribute("data-streaming", "false");
    expect(responses[1]).toHaveAttribute("data-streaming", "true");
  });

  it("marks nothing streaming when the message is not streaming", () => {
    render(
      <RenderedMessage
        message={msg("assistant", [{ type: "text", text: "done" }])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByTestId("response")).toHaveAttribute(
      "data-streaming",
      "false",
    );
  });

  it("routes approval-requested parts to the approval card", () => {
    render(
      <RenderedMessage
        message={msg("assistant", [
          {
            type: "tool-write_file",
            toolCallId: "t1",
            state: "approval-requested",
            approval: { id: "ap1" },
            input: { path: "/p", content: "c" },
          },
        ])}
        onApproval={noop}
        streaming={false}
      />,
    );
    expect(screen.getByText("Review required")).toBeInTheDocument();
  });
});

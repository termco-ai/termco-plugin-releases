// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { HashtagIcon } from "@hugeicons/core-free-icons";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FileAttachment } from "../lib/composer";
import type { Snippet } from "../lib/snippets";
import { ChipsRow } from "./ChipsRow";

afterEach(cleanup);

const noop = () => {};

function baseProps() {
  return {
    files: [] as FileAttachment[],
    onRemoveFile: noop,
    snippets: [] as Snippet[],
    onRemoveSnippet: noop,
    commands: [] as { name: string; label: string; icon: typeof HashtagIcon }[],
    onRemoveCommand: noop,
  };
}

function fileAtt(over: Partial<FileAttachment>): FileAttachment {
  return {
    id: "f1",
    name: "notes.txt",
    kind: "text",
    mediaType: "text/plain",
    size: 10,
    ...over,
  };
}

describe("ChipsRow", () => {
  it("renders nothing without leading content or attachments", () => {
    const { container } = render(<ChipsRow {...baseProps()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders when only leading content is present", () => {
    render(<ChipsRow {...baseProps()} leading={<span data-testid="lead" />} />);
    expect(screen.getByTestId("lead")).toBeInTheDocument();
  });

  it("renders command chips and removes by name", () => {
    const onRemoveCommand = vi.fn();
    render(
      <ChipsRow
        {...baseProps()}
        commands={[{ name: "init", label: "Initialize", icon: HashtagIcon }]}
        onRemoveCommand={onRemoveCommand}
      />,
    );
    expect(screen.getByText("#init")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove command" }));
    expect(onRemoveCommand).toHaveBeenCalledWith("init");
  });

  it("renders snippet chips and removes by id", () => {
    const onRemoveSnippet = vi.fn();
    render(
      <ChipsRow
        {...baseProps()}
        snippets={[
          {
            id: "s1",
            handle: "deploy",
            name: "Deploy",
            description: "Deploy steps",
            content: "...",
          },
        ]}
        onRemoveSnippet={onRemoveSnippet}
      />,
    );
    expect(screen.getByText("deploy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove snippet" }));
    expect(onRemoveSnippet).toHaveBeenCalledWith("s1");
  });

  it("renders a text file chip with an uppercase extension badge", () => {
    render(
      <ChipsRow {...baseProps()} files={[fileAtt({ name: "main.ts" })]} />,
    );
    expect(screen.getByText("TS")).toBeInTheDocument();
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });

  it("falls back to FILE for extensionless names", () => {
    render(
      <ChipsRow {...baseProps()} files={[fileAtt({ name: "Dockerfile" })]} />,
    );
    expect(screen.getByText("FILE")).toBeInTheDocument();
  });

  it("renders an image chip with a thumbnail", () => {
    const { container } = render(
      <ChipsRow
        {...baseProps()}
        files={[
          fileAtt({ kind: "image", name: "shot.png", url: "data:image/png," }),
        ]}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "data:image/png,");
  });

  it("renders a selection chip with a line count", () => {
    render(
      <ChipsRow
        {...baseProps()}
        files={[
          fileAtt({
            kind: "selection",
            name: "Terminal selection",
            source: "terminal",
            text: "a\nb\nc\n\n",
          }),
        ]}
      />,
    );
    expect(screen.getByText("· 3L")).toBeInTheDocument();
  });

  it("omits the line count for an empty selection text", () => {
    render(
      <ChipsRow
        {...baseProps()}
        files={[
          fileAtt({
            kind: "selection",
            name: "Editor selection",
            source: "editor",
            text: "",
          }),
        ]}
      />,
    );
    expect(screen.queryByText(/L$/)).not.toBeInTheDocument();
  });

  it("removes a file by id", () => {
    const onRemoveFile = vi.fn();
    render(
      <ChipsRow
        {...baseProps()}
        files={[fileAtt({ id: "f9" })]}
        onRemoveFile={onRemoveFile}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemoveFile).toHaveBeenCalledWith("f9");
  });
});

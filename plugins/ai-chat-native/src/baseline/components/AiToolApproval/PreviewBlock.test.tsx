// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreviewBlock } from "./PreviewBlock";

afterEach(cleanup);

describe("PreviewBlock", () => {
  it("renders the command and cwd for bash_run", () => {
    render(
      <PreviewBlock
        toolName="bash_run"
        input={{ command: "pnpm test", cwd: "/proj" }}
      />,
    );
    expect(screen.getByText("pnpm test")).toBeInTheDocument();
    expect(screen.getByText("/proj")).toBeInTheDocument();
  });

  it("omits the cwd row when cwd is not a string", () => {
    const { container } = render(
      <PreviewBlock toolName="bash_background" input={{ command: "ls" }} />,
    );
    expect(screen.getByText("ls")).toBeInTheDocument();
    expect(container.querySelectorAll(".font-mono")).toHaveLength(1);
  });

  it("summarizes write_file with a line count", () => {
    render(
      <PreviewBlock
        toolName="write_file"
        input={{ path: "/proj/a.ts", content: "l1\nl2\nl3" }}
      />,
    );
    expect(screen.getByText("/proj/a.ts")).toBeInTheDocument();
    expect(
      screen.getByText(/3 lines · review in the diff tab/),
    ).toBeInTheDocument();
  });

  it("uses singular wording for a one-line write", () => {
    render(
      <PreviewBlock
        toolName="write_file"
        input={{ path: "/p", content: "only" }}
      />,
    );
    expect(
      screen.getByText(/1 line · review in the diff tab/),
    ).toBeInTheDocument();
  });

  it("counts zero lines for empty write content", () => {
    render(
      <PreviewBlock
        toolName="write_file"
        input={{ path: "/p", content: "" }}
      />,
    );
    expect(screen.getByText(/0 lines/)).toBeInTheDocument();
  });

  it("summarizes edit with removed and added counts", () => {
    render(
      <PreviewBlock
        toolName="edit"
        input={{ path: "/p/f.ts", old_string: "a\nb", new_string: "x" }}
      />,
    );
    expect(screen.getByText(/−2 \/ \+1 lines/)).toBeInTheDocument();
  });

  it("marks replace_all edits", () => {
    render(
      <PreviewBlock
        toolName="edit"
        input={{
          path: "/p/f.ts",
          old_string: "a",
          new_string: "b",
          replace_all: true,
        }}
      />,
    );
    expect(screen.getByText(/\/p\/f\.ts · replace all/)).toBeInTheDocument();
    expect(screen.getByText(/−1 \/ \+1 line ·/)).toBeInTheDocument();
  });

  it("summarizes multi_edit with the edit count", () => {
    render(
      <PreviewBlock
        toolName="multi_edit"
        input={{
          path: "/p/m.ts",
          edits: [
            { old_string: "a", new_string: "b" },
            { old_string: "c", new_string: "d" },
          ],
        }}
      />,
    );
    expect(screen.getByText(/2 edits/)).toBeInTheDocument();
  });

  it("handles multi_edit with a non-array edits input", () => {
    render(
      <PreviewBlock toolName="multi_edit" input={{ path: "/p", edits: "x" }} />,
    );
    expect(screen.getByText(/0 edits/)).toBeInTheDocument();
  });

  it("shows only the path for create_directory", () => {
    render(
      <PreviewBlock toolName="create_directory" input={{ path: "/p/dir" }} />,
    );
    expect(screen.getByText("/p/dir")).toBeInTheDocument();
  });

  it("falls back to pretty JSON for unknown tools", () => {
    const { container } = render(
      <PreviewBlock toolName="mystery" input={{ foo: "bar" }} />,
    );
    expect(container.querySelector("pre")).toHaveTextContent('"foo": "bar"');
  });
});

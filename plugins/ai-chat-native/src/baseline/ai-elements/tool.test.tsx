// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chatStore = vi.hoisted(() => ({
  inject: vi.fn((_text: string) => true),
}));

vi.mock("../store/chatStore", () => ({
  useChatStore: {
    getState: () => ({ live: { injectIntoActivePty: chatStore.inject } }),
  },
}));

import {
  Tool,
  ToolInput,
  ToolOutput,
} from "./tool";

beforeEach(() => {
  chatStore.inject.mockClear();
  chatStore.inject.mockReturnValue(true);
});

afterEach(cleanup);

describe("Tool header", () => {
  it("renders the mapped label and path summary", () => {
    render(
      <Tool
        toolName="read_file"
        state="input-available"
        input={{ path: "/tmp/a.txt" }}
      />,
    );
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("/tmp/a.txt")).toBeInTheDocument();
    expect(screen.getByLabelText("running")).toBeInTheDocument();
  });

  it("falls back to the raw tool name for unknown tools", () => {
    render(<Tool toolName="my_custom_tool" state="output-available" />);
    expect(screen.getByText("my_custom_tool")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("labels every status dot", () => {
    const states = [
      ["approval-requested", "awaiting approval"],
      ["approval-responded", "responded"],
      ["input-streaming", "preparing"],
      ["input-available", "running"],
      ["output-available", "done"],
      ["output-denied", "denied"],
      ["output-error", "error"],
    ] as const;
    for (const [state, label] of states) {
      const { unmount } = render(<Tool toolName="grep" state={state} />);
      expect(screen.getByLabelText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("derives summaries per tool", () => {
    const cases: Array<[string, unknown, string]> = [
      ["bash_run", { command: "ls -la" }, "ls -la"],
      ["bash_logs", { id: "job-1" }, "job-1"],
      ["grep", { query: "needle" }, "needle"],
      ["glob", { pattern: "**/*.ts" }, "**/*.ts"],
      ["suggest_command", { description: "list files" }, "list files"],
      ["open_preview", { url: "http://localhost:3000" }, "http://localhost:3000"],
      ["run_subagent", { task: "review" }, "review"],
      ["todo_write", { todos: [{}] }, "1 item"],
      ["todo_write", { todos: [{}, {}, {}] }, "3 items"],
      ["create_directory", { path: "/tmp/dir" }, "/tmp/dir"],
    ];
    for (const [toolName, input, expected] of cases) {
      const { unmount } = render(
        <Tool toolName={toolName} state="input-available" input={input} />,
      );
      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    }
  });

  it("shows no summary for non-object input", () => {
    render(<Tool toolName="read_file" state="input-streaming" />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Tool details", () => {
  it("auto-opens on error and shows the failed badge with error text", () => {
    render(
      <Tool
        toolName="bash_run"
        state="output-error"
        input={{ command: "boom" }}
        errorText="command not found"
      />,
    );
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("command not found")).toBeInTheDocument();
  });

  it("hides streamed input bodies for heavy tools", () => {
    render(
      <Tool
        toolName="write_file"
        state="input-available"
        input={{ path: "/tmp/big.txt", content: "gigantic body" }}
        defaultOpen
      />,
    );
    expect(screen.getByText("/tmp/big.txt")).toBeInTheDocument();
    expect(screen.queryByText(/gigantic body/)).not.toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("still shows errors for heavy tools", () => {
    render(
      <Tool
        toolName="write_file"
        state="output-error"
        input={{ path: "/tmp/big.txt" }}
        errorText="denied by policy"
      />,
    );
    expect(screen.getByText("denied by policy")).toBeInTheDocument();
  });

  it("toggles details from the trigger", () => {
    render(
      <Tool
        toolName="grep"
        state="input-available"
        input={{ pattern: "foo", path: "/src" }}
      />,
    );
    expect(screen.queryByText("Input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("/src")).toBeInTheDocument();
  });

  it("re-renders when the output changes", () => {
    const { rerender } = render(
      <Tool
        toolName="bash_run"
        state="input-available"
        input={{ command: "ls" }}
      />,
    );
    rerender(
      <Tool
        toolName="bash_run"
        state="output-available"
        input={{ command: "ls" }}
        output={{ stdout: "file.txt", exit_code: 0 }}
        defaultOpen
      />,
    );
    expect(screen.getByLabelText("done")).toBeInTheDocument();
  });
});

describe("ToolInput previews", () => {
  it("shows command and cwd for bash_run", () => {
    render(
      <ToolInput
        toolName="bash_run"
        input={{ command: "cargo test", cwd: "/repo" }}
      />,
    );
    expect(screen.getByText("cargo test")).toBeInTheDocument();
    expect(screen.getByText("/repo")).toBeInTheDocument();
  });

  it("shows the bare path for file tools", () => {
    render(<ToolInput toolName="read_file" input={{ path: "/etc/hosts" }} />);
    expect(screen.getByText("/etc/hosts")).toBeInTheDocument();
  });

  it("falls back to pretty JSON for unknown shapes", () => {
    render(<ToolInput toolName="mystery" input={{ alpha: 1 }} />);
    expect(screen.getByText(/"alpha": 1/)).toBeInTheDocument();
  });

  it("prints string input verbatim", () => {
    render(<ToolInput toolName="mystery" input="raw text input" />);
    expect(screen.getByText("raw text input")).toBeInTheDocument();
  });

  it("renders nothing for null input", () => {
    const { container } = render(<ToolInput toolName="x" input={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ToolOutput", () => {
  it("summarizes read_file output with lines and bytes", () => {
    render(
      <ToolOutput
        toolName="read_file"
        output={{ path: "/a.txt", size: 2048, content: "a\nb\nc" }}
      />,
    );
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.getByText("· /a.txt")).toBeInTheDocument();
    expect(screen.getByText("(3 lines, 2.0KB)")).toBeInTheDocument();
  });

  it("uses singular line and omits size when missing", () => {
    render(
      <ToolOutput toolName="read_file" output={{ content: "only" }} />,
    );
    expect(screen.getByText("(1 line)")).toBeInTheDocument();
  });

  it("renders an empty marker for empty directories", () => {
    render(<ToolOutput toolName="list_directory" output={{ entries: [] }} />);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("groups directory entries before files", () => {
    render(
      <ToolOutput
        toolName="list_directory"
        output={{
          entries: [
            { name: "readme.md", kind: "file" },
            { name: "src", kind: "directory" },
          ],
        }}
      />,
    );
    expect(screen.getByText("src/")).toBeInTheDocument();
    expect(screen.getByText("readme.md")).toBeInTheDocument();
  });

  it("shows bash_run stdout with an exit badge and switches to stderr", () => {
    render(
      <ToolOutput
        toolName="bash_run"
        output={{
          stdout: "ok output",
          stderr: "warn output",
          exit_code: 0,
          cwd_after: "/next",
        }}
      />,
    );
    expect(screen.getByText("ok output")).toBeInTheDocument();
    expect(screen.getByText("exit 0")).toBeInTheDocument();
    expect(screen.getByText("cwd → /next")).toBeInTheDocument();
    fireEvent.click(screen.getByText("stderr"));
    expect(screen.getByText("warn output")).toBeInTheDocument();
  });

  it("starts on stderr when stdout is empty and flags failures", () => {
    render(
      <ToolOutput
        toolName="bash_run"
        output={{
          stdout: "",
          stderr: "boom",
          exit_code: 1,
          timed_out: true,
          truncated: true,
        }}
      />,
    );
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("exit 1")).toBeInTheDocument();
    expect(screen.getByText("timed out")).toBeInTheDocument();
    expect(screen.getByText("truncated")).toBeInTheDocument();
    const stdoutTab = screen.getByText("stdout").closest("button");
    expect(stdoutTab).toBeDisabled();
  });

  it("renders suggest_command with a working insert button", () => {
    render(
      <ToolOutput
        toolName="suggest_command"
        output={{ command: "git status", explanation: "shows changes" }}
      />,
    );
    expect(screen.getByText("shows changes")).toBeInTheDocument();
    expect(screen.getByText("git status")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Insert into active terminal"));
    expect(chatStore.inject).toHaveBeenCalledWith("git status");
    expect(screen.getByText("Inserted")).toBeInTheDocument();
  });

  it("keeps the insert button active when injection fails", () => {
    chatStore.inject.mockReturnValue(false);
    render(
      <ToolOutput toolName="suggest_command" output={{ command: "ls" }} />,
    );
    fireEvent.click(screen.getByLabelText("Insert into active terminal"));
    expect(screen.getByText("Insert")).toBeInTheDocument();
  });

  it("falls back to JSON when suggest_command has no command", () => {
    render(
      <ToolOutput toolName="suggest_command" output={{ explanation: "x" }} />,
    );
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText(/"explanation": "x"/)).toBeInTheDocument();
  });

  it("reports grep misses with the scan count", () => {
    render(
      <ToolOutput
        toolName="grep"
        output={{ hits: [], files_scanned: 5 }}
      />,
    );
    expect(
      screen.getByText("no matches · 5 files scanned"),
    ).toBeInTheDocument();
  });

  it("lists grep hits with highlighted matches", () => {
    render(
      <ToolOutput
        toolName="grep"
        output={{
          hits: [
            { rel: "src/a.ts", line: 3, text: "const needle = 1" },
            { path: "src/b.ts", line: 9, text: "no match text" },
          ],
          pattern: "needle",
          truncated: true,
          files_scanned: 3,
        }}
      />,
    );
    expect(screen.getByText("src/a.ts:3")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts:9")).toBeInTheDocument();
    expect(screen.getByText("needle").tagName).toBe("MARK");
    expect(screen.getByText("2 hits · 3 files")).toBeInTheDocument();
    expect(screen.getByText("truncated")).toBeInTheDocument();
  });

  it("lists glob matches and supports the paths fallback", () => {
    const { unmount } = render(
      <ToolOutput toolName="glob" output={{ matches: ["a.ts", "b.ts"] }} />,
    );
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    unmount();

    render(<ToolOutput toolName="glob" output={{ paths: ["c.ts"] }} />);
    expect(screen.getByText("c.ts")).toBeInTheDocument();
  });

  it("shows no matches for an empty glob", () => {
    render(<ToolOutput toolName="glob" output={{ matches: [] }} />);
    expect(screen.getByText("no matches")).toBeInTheDocument();
  });

  it("summarizes edit replacements with pluralization", () => {
    const { unmount } = render(
      <ToolOutput
        toolName="edit"
        output={{ replacements: 2, path: "/f.ts" }}
      />,
    );
    expect(screen.getByText("2 replacements")).toBeInTheDocument();
    expect(screen.getByText("· /f.ts")).toBeInTheDocument();
    unmount();

    render(<ToolOutput toolName="multi_edit" output={{ replacements: 1 }} />);
    expect(screen.getByText("1 replacement")).toBeInTheDocument();
  });

  it("falls back to JSON when an edit was not ok", () => {
    render(<ToolOutput toolName="edit" output={{ ok: false }} />);
    expect(screen.getByText(/"ok": false/)).toBeInTheDocument();
  });

  it("summarizes write_file and create_directory results", () => {
    const { unmount } = render(
      <ToolOutput
        toolName="write_file"
        output={{ path: "/w.txt", bytesWritten: 12 }}
      />,
    );
    expect(screen.getByText("wrote")).toBeInTheDocument();
    expect(screen.getByText("(12B)")).toBeInTheDocument();
    unmount();

    render(
      <ToolOutput
        toolName="create_directory"
        output={{ path: "/dir", bytesWritten: 3 * 1024 * 1024 }}
      />,
    );
    expect(screen.getByText("created")).toBeInTheDocument();
    expect(screen.getByText("(3.0MB)")).toBeInTheDocument();
  });

  it("shows bash_background handles as running", () => {
    render(
      <ToolOutput
        toolName="bash_background"
        output={{ handle: "bg-7", command: "pnpm dev" }}
      />,
    );
    expect(screen.getByText("bg-7")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("pnpm dev")).toBeInTheDocument();
  });

  it("renders plain string output in a code block", () => {
    render(<ToolOutput toolName="anything" output="stringy result" />);
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("stringy result")).toBeInTheDocument();
  });

  it("renders nothing for null output without error", () => {
    const { container } = render(
      <ToolOutput toolName="anything" output={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a browser screenshot as an image, not a base64 blob", () => {
    const png = "iVBORw0KGgoAAAANS"; // stand-in base64 body
    render(
      <ToolOutput
        toolName="browser_screenshot"
        output={{ ok: true, url: "https://x.dev/login", png }}
      />,
    );
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe(`data:image/png;base64,${png}`);
    // The raw base64 must not leak into the DOM as text.
    expect(screen.queryByText(png)).not.toBeInTheDocument();
    expect(screen.getByText("https://x.dev/login")).toBeInTheDocument();
  });

  it("honors the screenshot mediaType in the data URI", () => {
    const png = "SGVsbG8=";
    render(
      <ToolOutput
        toolName="browser_screenshot"
        output={{ ok: true, url: "https://x.dev", png, mediaType: "image/jpeg" }}
      />,
    );
    const img = screen.getByRole("img") as HTMLImageElement;
    expect(img.src).toBe(`data:image/jpeg;base64,${png}`);
  });

  it("falls back to error display for a failed screenshot", () => {
    render(
      <ToolOutput
        toolName="browser_screenshot"
        output={{ error: "no browser tab open" }}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("no browser tab open")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { useChatStore } from "../../store/chatStore";
import { useSnippetsStore } from "../../store/snippetsStore";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiComposerInput } from "./AiComposerInput";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

const h = vi.hoisted(() => ({
  submit: vi.fn(),
  addSnippet: vi.fn(),
  addCommand: vi.fn(),
  attachFileByPath: vi.fn(async () => {}),
  setValueSpy: vi.fn(),
  voice: { recording: false, transcribing: false },
  workspaceFiles: {
    files: ["src/app.ts", "src/util.ts", "readme.md"],
    indexing: false,
    truncated: false,
  },
}));

vi.mock("../../lib/composer", async () => {
  const { useRef, useState } = await import("react");
  return {
    ACCEPTED_FILES: "",
    useComposer: () => {
      const [value, setValue] = useState("");
      const textareaRef = useRef<HTMLTextAreaElement>(null);
      return {
        textareaRef,
        value,
        setValue: (v: string) => {
          h.setValueSpy(v);
          setValue(v);
        },
        voice: h.voice,
        submit: h.submit,
        addSnippet: h.addSnippet,
        addCommand: h.addCommand,
        attachFileByPath: h.attachFileByPath,
      };
    },
  };
});

vi.mock("../../hooks/useWorkspaceFiles", () => ({
  useWorkspaceFiles: () => h.workspaceFiles,
}));

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  Popover: ({
    open,
    children,
  }: {
    open?: boolean;
    children?: React.ReactNode;
  }) => (
    <div data-testid="popover" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  PopoverAnchor: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../AgentSwitcher", () => ({
  AgentSwitcher: () => <div data-testid="agent-switcher" />,
}));

type FilePickerProps = {
  files: string[];
  activeIndex: number;
  onPick: (f: string) => void;
};
vi.mock("../FilePicker", () => ({
  FilePickerContent: ({ files, activeIndex, onPick }: FilePickerProps) => (
    <div data-testid="file-picker" data-active={activeIndex}>
      {files.map((f) => (
        <button key={f} type="button" onClick={() => onPick(f)}>
          {f}
        </button>
      ))}
    </div>
  ),
}));

type PickerItemStub =
  | { kind: "command"; command: { name: string } }
  | { kind: "snippet"; snippet: { handle: string } };
type SnippetPickerProps = {
  items: PickerItemStub[];
  activeIndex: number;
  onPick: (it: PickerItemStub) => void;
};
vi.mock("../SnippetPicker", () => ({
  SnippetPickerContent: ({
    items,
    activeIndex,
    onPick,
  }: SnippetPickerProps) => (
    <div data-testid="snippet-picker" data-active={activeIndex}>
      {items.map((it) => {
        const key =
          it.kind === "command"
            ? `cmd:${it.command.name}`
            : `snip:${it.snippet.handle}`;
        return (
          <button key={key} type="button" onClick={() => onPick(it)}>
            {key}
          </button>
        );
      })}
    </div>
  ),
}));

function textarea(): HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLTextAreaElement;
}

/** Set the textarea value and put the caret at the end. */
function typeValue(v: string) {
  const el = textarea();
  fireEvent.change(el, { target: { value: v } });
  el.setSelectionRange(v.length, v.length);
  fireEvent.keyUp(el, { key: "Shift" });
}

function pickerItems(): string[] {
  const picker = screen.queryByTestId("snippet-picker");
  if (!picker) return [];
  return Array.from(picker.querySelectorAll("button")).map(
    (b) => b.textContent ?? "",
  );
}

beforeEach(() => {
  h.voice.recording = false;
  h.voice.transcribing = false;
  useChatStore.setState({
    live: {
      ...useChatStore.getState().live,
      getWorkspaceRoot: () => "/ws",
    },
  });
  useSnippetsStore.setState({
    snippets: [
      {
        id: "s1",
        handle: "deploy",
        name: "Deploy Steps",
        description: "How to deploy",
        content: "steps",
      },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AiComposerInput", () => {
  it("renders the textarea with a closed picker", () => {
    render(<AiComposerInput />);
    expect(textarea()).toBeInTheDocument();
    expect(screen.getByTestId("popover")).toHaveAttribute("data-open", "false");
  });

  it("opens the picker with commands and snippets on #", () => {
    render(<AiComposerInput />);
    typeValue("#");
    expect(screen.getByTestId("popover")).toHaveAttribute("data-open", "true");
    expect(pickerItems()).toEqual([
      "cmd:init",
      "cmd:plan",
      "cmd:grill",
      "cmd:compact",
      "cmd:review",
      "cmd:tdd",
      "cmd:debug",
      "cmd:research",
      "cmd:handoff",
      "cmd:glossary",
      "cmd:claude-code",
      "snip:deploy",
    ]);
  });

  it("offers only commands on /", () => {
    render(<AiComposerInput />);
    typeValue("/");
    expect(pickerItems()).toEqual([
      "cmd:init",
      "cmd:plan",
      "cmd:grill",
      "cmd:compact",
      "cmd:review",
      "cmd:tdd",
      "cmd:debug",
      "cmd:research",
      "cmd:handoff",
      "cmd:glossary",
      "cmd:claude-code",
    ]);
  });

  it("filters picker items by the typed query", () => {
    render(<AiComposerInput />);
    typeValue("#dep");
    expect(pickerItems()).toEqual(["snip:deploy"]);
  });

  it("moves the active row with arrow keys and clamps at the ends", () => {
    render(<AiComposerInput />);
    typeValue("#");
    const picker = () => screen.getByTestId("snippet-picker");
    expect(picker()).toHaveAttribute("data-active", "0");
    fireEvent.keyDown(textarea(), { key: "ArrowDown" });
    expect(picker()).toHaveAttribute("data-active", "1");
    fireEvent.keyDown(textarea(), { key: "ArrowUp" });
    fireEvent.keyDown(textarea(), { key: "ArrowUp" });
    expect(picker()).toHaveAttribute("data-active", "0");
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(textarea(), { key: "ArrowDown" });
    }
    // Clamps at the last row: eleven commands plus the one snippet.
    expect(picker()).toHaveAttribute("data-active", "11");
  });

  it("picks the active command with Enter and clears the trigger", () => {
    render(<AiComposerInput />);
    typeValue("/");
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(h.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({ name: "init" }),
    );
    expect(h.setValueSpy).toHaveBeenLastCalledWith("");
    expect(h.submit).not.toHaveBeenCalled();
    expect(screen.getByTestId("popover")).toHaveAttribute("data-open", "false");
  });

  it("picks a snippet with Tab and rewrites it as a #handle token", () => {
    render(<AiComposerInput />);
    typeValue("#dep");
    fireEvent.keyDown(textarea(), { key: "Tab" });
    expect(h.addSnippet).toHaveBeenCalledWith(
      expect.objectContaining({ handle: "deploy" }),
    );
    expect(h.setValueSpy).toHaveBeenLastCalledWith("#deploy ");
  });

  it("closes the snippet picker on Escape without touching the text", () => {
    render(<AiComposerInput />);
    typeValue("#de");
    fireEvent.keyDown(textarea(), { key: "Escape" });
    expect(screen.getByTestId("popover")).toHaveAttribute("data-open", "false");
    expect(textarea().value).toBe("#de");
  });

  it("opens the file picker on @", () => {
    render(<AiComposerInput />);
    typeValue("@");
    const picker = screen.getByTestId("file-picker");
    expect(picker.querySelectorAll("button")).toHaveLength(3);
  });

  it("narrows the file list after the query debounce", async () => {
    render(<AiComposerInput />);
    typeValue("@app");
    await waitFor(() => {
      const names = Array.from(
        screen.getByTestId("file-picker").querySelectorAll("button"),
      ).map((b) => b.textContent);
      expect(names).toEqual(["src/app.ts"]);
    });
  });

  it("attaches the active file with Enter and removes the trigger text", async () => {
    render(<AiComposerInput />);
    typeValue("@");
    fireEvent.keyDown(textarea(), { key: "Enter" });
    await waitFor(() => {
      expect(h.attachFileByPath).toHaveBeenCalledWith("/ws/src/app.ts");
    });
    expect(h.setValueSpy).toHaveBeenLastCalledWith("");
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("removes the @query from the text on Escape", () => {
    render(<AiComposerInput />);
    typeValue("@ap");
    fireEvent.keyDown(textarea(), { key: "Escape" });
    expect(h.setValueSpy).toHaveBeenLastCalledWith("");
    expect(textarea().value).toBe("");
  });

  it("submits on Enter when no picker is open", () => {
    render(<AiComposerInput />);
    typeValue("hello world");
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter when the picker matched nothing", () => {
    render(<AiComposerInput />);
    typeValue("#zzz-nothing");
    expect(pickerItems()).toEqual([]);
    fireEvent.keyDown(textarea(), { key: "Enter" });
    expect(h.submit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Shift+Enter", () => {
    render(<AiComposerInput />);
    typeValue("hello");
    fireEvent.keyDown(textarea(), { key: "Enter", shiftKey: true });
    expect(h.submit).not.toHaveBeenCalled();
  });

  it("shows the listening indicator while recording", () => {
    h.voice.recording = true;
    render(<AiComposerInput />);
    expect(screen.getByText("Listening…")).toBeInTheDocument();
  });

  it("shows the transcribing indicator with a spinner", () => {
    h.voice.transcribing = true;
    render(<AiComposerInput />);
    expect(screen.getByText("Transcribing…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("hides the voice row when idle", () => {
    render(<AiComposerInput />);
    expect(screen.queryByText("Listening…")).not.toBeInTheDocument();
    expect(screen.queryByText("Transcribing…")).not.toBeInTheDocument();
  });
});

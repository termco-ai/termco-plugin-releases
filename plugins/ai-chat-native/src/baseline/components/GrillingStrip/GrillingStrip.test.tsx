// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver ?? (ResizeObserverStub as never);

const h = vi.hoisted(() => ({
  createDir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
  getWorkspaceRoot: vi.fn((): string | null => "/proj"),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../lib/native", () => ({
  native: { createDir: h.createDir, writeFile: h.writeFile },
}));
vi.mock("sonner", () => ({
  toast: { success: h.success, error: h.error },
}));
vi.mock("../../store/chatStore", () => ({
  useChatStore: {
    getState: () => ({ live: { getWorkspaceRoot: h.getWorkspaceRoot } }),
  },
}));

import { GrillingStrip, slug } from "./GrillingStrip";

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Part = Record<string, unknown>;

function ask(
  id: string,
  state: string,
  input: Record<string, unknown>,
  output?: unknown,
): Part {
  return { type: "tool-ask_user", toolCallId: id, state, input, output };
}

function assistant(id: string, ...parts: Part[]): UIMessage {
  return { id, role: "assistant", parts } as unknown as UIMessage;
}

const MESSAGES: UIMessage[] = [
  assistant(
    "m1",
    ask(
      "q1",
      "output-available",
      { question: "Where does state live?", topic: "The plan" },
      { answer: "Zustand store", selected: ["Zustand store"] },
    ),
  ),
  assistant(
    "m2",
    ask("q2", "input-available", {
      question: "How does it end?",
      topic: "The plan",
    }),
  ),
];

describe("GrillingStrip", () => {
  it("stays out of the way when nothing has been asked", () => {
    const { container } = render(<GrillingStrip messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the decisions and marks the open one as waiting", () => {
    render(<GrillingStrip messages={MESSAGES} />);
    expect(screen.getByTestId("grilling-strip")).toBeInTheDocument();
    expect(screen.getByText("The plan")).toBeInTheDocument();
    expect(screen.getByText("1. Where does state live?")).toBeInTheDocument();
    expect(screen.getByText("Zustand store")).toBeInTheDocument();
    expect(screen.getByText("waiting…")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("falls back to a neutral heading with no topic", () => {
    render(
      <GrillingStrip
        messages={[
          assistant("m1", ask("q1", "input-available", { question: "Q?" })),
        ]}
      />,
    );
    expect(screen.getByText("Decisions")).toBeInTheDocument();
  });

  it("copies the decision log as Markdown", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<GrillingStrip messages={MESSAGES} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Copy the decision log/ }),
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    const md = writeText.mock.calls[0]?.[0] as unknown as string;
    expect(md).toContain("# Grilling — The plan");
    expect(md).toContain("**Decision:** Zustand store");
  });

  it("saves the log under the workspace and reports the path", async () => {
    render(<GrillingStrip messages={MESSAGES} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Save the decision log/ }),
    );
    await vi.waitFor(() => expect(h.writeFile).toHaveBeenCalled());
    expect(h.createDir).toHaveBeenCalledWith("/proj/.termco/grillings");
    const [path, body] = h.writeFile.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(path).toMatch(
      /^\/proj\/\.termco\/grillings\/\d{4}-\d{2}-\d{2}-the-plan\.md$/,
    );
    expect(body).toContain("Where does state live?");
    expect(h.success).toHaveBeenCalled();
  });

  it("refuses to save with no folder open", async () => {
    h.getWorkspaceRoot.mockReturnValueOnce(null);
    render(<GrillingStrip messages={MESSAGES} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Save the decision log/ }),
    );
    await vi.waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.writeFile).not.toHaveBeenCalled();
  });

  it("surfaces a failed write instead of claiming success", async () => {
    h.writeFile.mockRejectedValueOnce(new Error("EACCES"));
    render(<GrillingStrip messages={MESSAGES} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Save the decision log/ }),
    );
    await vi.waitFor(() => expect(h.error).toHaveBeenCalled());
    expect(h.success).not.toHaveBeenCalled();
  });
});

describe("slug", () => {
  it("makes a filename-safe stem", () => {
    expect(slug("The Plan: v2!")).toBe("the-plan-v2");
    expect(slug("   ")).toBe("session");
    expect(slug("a".repeat(80))).toHaveLength(48);
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { SessionMeta } from "../../../sessions";
import { useChatStore } from "../../store/chatStore";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionPicker } from "./SessionPicker";

vi.mock("../../runtime/platform", () => import("../../runtime/platformTestMock"));

vi.mock("@termco/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@termco/ui")>()),
  Popover: ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (
    <div data-testid="popover-root" data-open={String(open)}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
  PopoverContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
}));

function session(
  id: string,
  title: string,
  updatedAt: number,
  rigId = "default",
): SessionMeta {
  return { id, title, rigId, createdAt: updatedAt, updatedAt };
}

function seedStore(sessions: SessionMeta[], activeId: string | null) {
  useChatStore.setState({
    sessions,
    activeSessionId: activeId,
    currentRigId: "default",
    switchSession: vi.fn(),
    newSession: vi.fn(),
    deleteSession: vi.fn(),
  });
}

afterEach(() => {
  cleanup();
  useChatStore.setState({ sessions: [], activeSessionId: null });
});

describe("SessionPicker", () => {
  it("renders nothing when there is no active session", () => {
    seedStore([session("a", "Alpha", 1)], null);
    const { container } = render(<SessionPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses a non-modal popover for conversation history", () => {
    seedStore([session("a", "Alpha", 1)], "a");
    render(<SessionPicker />);
    expect(screen.getByTestId("popover-root")).toBeInTheDocument();
  });

  it("shows the active session title in the trigger", () => {
    seedStore([session("a", "Alpha", 1)], "a");
    render(<SessionPicker />);
    expect(screen.getByTestId("popover-trigger")).toHaveTextContent("Alpha");
  });

  it("falls back to 'New chat' for an untitled active session", () => {
    seedStore([session("a", "", 1)], "a");
    render(<SessionPicker />);
    expect(screen.getByTestId("popover-trigger")).toHaveTextContent("New chat");
  });

  it("lists only the current rig's sessions (per-rig view of the pool)", () => {
    // Pool has chats in two spaces; the picker is scoped to the current space.
    seedStore(
      [
        session("a", "Alpha", 2, "default"),
        session("b", "OtherRigChat", 3, "rig-2"),
        session("c", "Charlie", 1, "default"),
      ],
      "a",
    );
    render(<SessionPicker />);
    const items = screen.getAllByRole("menuitem");
    const titles = items.map((i) => i.textContent);
    expect(titles.some((t) => t?.includes("Alpha"))).toBe(true);
    expect(titles.some((t) => t?.includes("Charlie"))).toBe(true);
    // The other rig's chat is NOT listed here.
    expect(titles.some((t) => t?.includes("OtherRigChat"))).toBe(false);
  });

  it("lists sessions most-recently-updated first", () => {
    seedStore([session("old", "Old", 1), session("new", "Newest", 9)], "old");
    render(<SessionPicker />);
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Newest");
    expect(items[1]).toHaveTextContent("Old");
  });

  it("creates a session from the New session item", () => {
    seedStore([session("a", "Alpha", 1)], "a");
    render(<SessionPicker />);
    fireEvent.click(screen.getByText("New chat", { selector: "button" }));
    expect(useChatStore.getState().newSession).toHaveBeenCalledTimes(1);
  });

  it("switches to a session when its row is selected", () => {
    seedStore([session("a", "Alpha", 2), session("b", "Beta", 1)], "a");
    render(<SessionPicker />);
    fireEvent.click(screen.getByText("Beta"));
    expect(useChatStore.getState().switchSession).toHaveBeenCalledWith("b");
  });

  it("confirms before deleting a session without switching", () => {
    seedStore([session("a", "Alpha", 2), session("b", "Beta", 1)], "a");
    render(<SessionPicker />);
    const deleteButtons = screen.getAllByTitle("Delete session");
    fireEvent.click(deleteButtons[1]);
    expect(useChatStore.getState().deleteSession).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this conversation?")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete conversation" }),
    );
    expect(useChatStore.getState().deleteSession).toHaveBeenCalledWith("b");
    expect(useChatStore.getState().switchSession).not.toHaveBeenCalled();
  });

  it("highlights the active session row", () => {
    seedStore([session("a", "Alpha", 2), session("b", "Beta", 1)], "b");
    render(<SessionPicker />);
    const items = screen.getAllByRole("menuitem");
    const beta = items.find((el) => el.textContent?.includes("Beta"));
    expect(beta?.className).toContain("bg-[var(--signal-soft)]");
  });
});

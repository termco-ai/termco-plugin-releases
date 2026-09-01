// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { TooltipProvider } from "@termco/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommitComposer } from "./CommitComposer";

afterEach(cleanup);

type Props = ComponentProps<typeof CommitComposer>;

function renderComposer(overrides: Partial<Props> = {}) {
  const props: Props = {
    commitMessage: "",
    setCommitMessage: vi.fn(),
    onCommitKeyDown: vi.fn(),
    commitShortcut: "⌘↩",
    generateShortcut: "⌘G",
    generateCommitMessageHint: "Generate commit message",
    canGenerateCommitMessage: true,
    actionBusy: null,
    onGenerateCommitMessage: vi.fn(),
    canCommit: true,
    commitHint: "Commit with ⌘↩.",
    onCommit: vi.fn(),
    canPush: true,
    pushDisabledReason: "Pushes to origin/main.",
    onPush: vi.fn(),
    stagedCount: 1,
    pushStatusLabel: "origin/main",
    footerFeedback: null,
    ...overrides,
  };
  render(
    <TooltipProvider>
      <CommitComposer {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("CommitComposer", () => {
  it("edits the commit message through the textarea", () => {
    const props = renderComposer();
    fireEvent.change(screen.getByPlaceholderText("Commit message"), {
      target: { value: "feat: new" },
    });
    expect(props.setCommitMessage).toHaveBeenCalledWith("feat: new");
  });

  it("forwards keydown events for shortcuts", () => {
    const props = renderComposer();
    fireEvent.keyDown(screen.getByPlaceholderText("Commit message"), {
      key: "Enter",
      metaKey: true,
    });
    expect(props.onCommitKeyDown).toHaveBeenCalled();
  });

  it("shows the shortcut hint when empty and the char count otherwise", () => {
    renderComposer();
    expect(screen.getByText("to commit")).toBeInTheDocument();
    cleanup();
    renderComposer({ commitMessage: "feat: x" });
    expect(screen.getByText("Ch: 7")).toBeInTheDocument();
  });

  it("summarizes the staged count", () => {
    renderComposer({ stagedCount: 0 });
    expect(screen.getByText("Nothing staged")).toBeInTheDocument();
    cleanup();
    renderComposer({ stagedCount: 1 });
    expect(screen.getByText("1 file staged")).toBeInTheDocument();
    cleanup();
    renderComposer({ stagedCount: 3 });
    expect(screen.getByText("3 files staged")).toBeInTheDocument();
  });

  it("shows the push status label", () => {
    renderComposer({ pushStatusLabel: "No upstream" });
    expect(screen.getByText("No upstream")).toBeInTheDocument();
  });

  it("commits from the commit button", () => {
    const props = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    expect(props.onCommit).toHaveBeenCalled();
  });

  it("disables the commit button and shows progress while committing", () => {
    const props = renderComposer({ canCommit: false, actionBusy: "commit" });
    const button = screen.getByRole("button", { name: "Committing…" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("pushes from the push button", () => {
    const props = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Push" }));
    expect(props.onPush).toHaveBeenCalled();
  });

  it("disables push while busy or unavailable", () => {
    renderComposer({ canPush: false });
    expect(screen.getByRole("button", { name: "Push" })).toBeDisabled();
    cleanup();
    renderComposer({ actionBusy: "push" });
    expect(screen.getByRole("button", { name: "Pushing…" })).toBeDisabled();
  });

  it("generates a commit message from the sparkle button", () => {
    const props = renderComposer();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Generate commit message (⌘G)",
      }),
    );
    expect(props.onGenerateCommitMessage).toHaveBeenCalled();
  });

  it("disables generation with the hint as the label", () => {
    const props = renderComposer({
      canGenerateCommitMessage: false,
      generateCommitMessageHint: "Stage changes to generate a commit message",
    });
    const button = screen.getByRole("button", {
      name: "Stage changes to generate a commit message (⌘G)",
    });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(props.onGenerateCommitMessage).not.toHaveBeenCalled();
  });

  it("renders footer feedback", () => {
    renderComposer({
      footerFeedback: { tone: "error", message: "commit failed" },
    });
    expect(screen.getByText("commit failed")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscardDialog } from "./DiscardDialog";

afterEach(cleanup);

describe("DiscardDialog", () => {
  it("stays closed without a pending discard", () => {
    render(
      <DiscardDialog
        pendingDiscard={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText("Discard changes?")).toBeNull();
  });

  it("describes a single-file discard", () => {
    render(
      <DiscardDialog
        pendingDiscard={{ scope: "single", count: 1, label: "src/a.ts" }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    expect(
      screen.getByText('Discard changes in "src/a.ts"? This cannot be undone.'),
    ).toBeInTheDocument();
  });

  it("describes a discard-all", () => {
    render(
      <DiscardDialog
        pendingDiscard={{ scope: "all", count: 2, label: "2 unstaged files" }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "This will discard 2 unstaged files and cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("confirms the discard", () => {
    const onConfirm = vi.fn();
    render(
      <DiscardDialog
        pendingDiscard={{ scope: "single", count: 1, label: "a.ts" }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels the discard", () => {
    const onCancel = vi.fn();
    render(
      <DiscardDialog
        pendingDiscard={{ scope: "single", count: 1, label: "a.ts" }}
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

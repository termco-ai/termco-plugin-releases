// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueuedEdit } from "../../store/planStore";
import { PlanRow } from "./PlanRow";

afterEach(cleanup);

function makeItem(over: Partial<QueuedEdit> = {}): QueuedEdit {
  return {
    id: "q1",
    kind: "edit",
    path: "/proj/src/main.ts",
    originalContent: "a\nold",
    proposedContent: "a\nnew",
    isNewFile: false,
    ...over,
  };
}

describe("PlanRow", () => {
  it("renders basename, full path, stats, and kind", () => {
    render(<PlanRow item={makeItem()} onReject={() => {}} />);
    expect(screen.getByText("main.ts")).toBeInTheDocument();
    expect(screen.getByText("/proj/src/main.ts")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
    expect(screen.getByText("edit")).toBeInTheDocument();
  });

  it("labels multi_edit rows as multi-edit", () => {
    render(
      <PlanRow item={makeItem({ kind: "multi_edit" })} onReject={() => {}} />,
    );
    expect(screen.getByText("multi-edit")).toBeInTheDocument();
  });

  it("shows the new badge for new files", () => {
    render(
      <PlanRow
        item={makeItem({ kind: "write_file", isNewFile: true })}
        onReject={() => {}}
      />,
    );
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("does not show the new badge for directories", () => {
    render(
      <PlanRow
        item={makeItem({ kind: "create_directory", isNewFile: true })}
        onReject={() => {}}
      />,
    );
    expect(screen.queryByText("new")).not.toBeInTheDocument();
  });

  it("shows the description instead of stats for create_directory", () => {
    render(
      <PlanRow
        item={makeItem({
          kind: "create_directory",
          path: "/proj/newdir",
          originalContent: "",
          proposedContent: "",
          description: "make the assets dir",
        })}
        onReject={() => {}}
      />,
    );
    expect(screen.getByText("make the assets dir")).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toggle diff" })).toBeDisabled();
  });

  it("falls back to a default directory description", () => {
    render(
      <PlanRow
        item={makeItem({ kind: "create_directory", description: undefined })}
        onReject={() => {}}
      />,
    );
    expect(screen.getByText("create directory")).toBeInTheDocument();
  });

  it("toggles the inline diff open and closed", () => {
    render(<PlanRow item={makeItem()} onReject={() => {}} />);
    const toggle = screen.getByRole("button", { name: "Toggle diff" });
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("old")).not.toBeInTheDocument();
  });

  it("never opens a diff for directories", () => {
    render(
      <PlanRow
        item={makeItem({ kind: "create_directory" })}
        onReject={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Toggle diff" }));
    expect(screen.queryByText("old")).not.toBeInTheDocument();
  });

  it("fires onReject from the reject button", () => {
    const onReject = vi.fn();
    render(<PlanRow item={makeItem()} onReject={onReject} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

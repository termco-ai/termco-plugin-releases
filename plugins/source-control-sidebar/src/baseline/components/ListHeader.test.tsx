// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListHeader } from "./ListHeader";
import type { RowRendererProps } from "./types";

afterEach(cleanup);

function renderHeader(overrides: Partial<RowRendererProps> = {}) {
  const onToggleAll = vi.fn();
  const props: RowRendererProps = {
    row: { kind: "list-header", key: "list-header", count: 3 },
    focused: false,
    selectedPath: null,
    actionBusy: null,
    headerCheckState: "unchecked",
    repoRoot: "/repo",
    onFocusRow: vi.fn(),
    onToggleAll,
    onSelectFile: vi.fn(async () => {}),
    onToggleStageFile: vi.fn(async () => {}),
    onDiscardFile: vi.fn(),
    ...overrides,
  };
  render(
    <ListHeader
      {...props}
      row={{ kind: "list-header", key: "list-header", count: 3 }}
    />,
  );
  return { onToggleAll: props.onToggleAll };
}

describe("ListHeader", () => {
  it("shows the change count", () => {
    renderHeader();
    expect(screen.getByText("Changes")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("toggles all files from the header checkbox", () => {
    const { onToggleAll } = renderHeader();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Stage all changes" }),
    );
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("reflects the aggregated check state", () => {
    renderHeader({ headerCheckState: "checked" });
    expect(
      screen.getByRole("checkbox", { name: "Stage all changes" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("disables the checkbox while an action is busy", () => {
    const { onToggleAll } = renderHeader({ actionBusy: "stage:all" });
    const checkbox = screen.getByRole("checkbox", {
      name: "Stage all changes",
    });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(onToggleAll).not.toHaveBeenCalled();
  });
});

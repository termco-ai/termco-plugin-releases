// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModeChips } from "./ModeChips";

afterEach(cleanup);

describe("ModeChips", () => {
  it("offers every palette mode", () => {
    render(<ModeChips active="commands" onPick={vi.fn()} />);
    for (const label of ["Commands", "History", "In files", "Themes"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
  });

  it("marks only the active mode as pressed", () => {
    render(<ModeChips active="history" onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /History/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Commands/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("teaches the sigil that reaches each mode", () => {
    render(<ModeChips active="commands" onPick={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /History/ }).textContent,
    ).toContain(">");
    expect(
      screen.getByRole("button", { name: /In files/ }).textContent,
    ).toContain("#");
  });

  it("reports the picked mode", () => {
    const onPick = vi.fn();
    render(<ModeChips active="commands" onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /In files/ }));
    expect(onPick).toHaveBeenCalledExactlyOnceWith("content");
    fireEvent.click(screen.getByRole("button", { name: /Themes/ }));
    expect(onPick).toHaveBeenLastCalledWith("themes");
  });
});

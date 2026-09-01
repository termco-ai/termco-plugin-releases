// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(cleanup);

describe("EmptyState", () => {
  it("renders the headline and all three suggestions", () => {
    render(<EmptyState onPick={() => {}} />);
    expect(screen.getByText("What should happen next?")).toBeInTheDocument();
    expect(screen.getByText("Explain the last error")).toBeInTheDocument();
    expect(screen.getByText("Generate a command")).toBeInTheDocument();
    expect(screen.getByText("Summarize recent activity")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("passes the suggestion prompt text to onPick", () => {
    const onPick = vi.fn();
    render(<EmptyState onPick={onPick} />);
    fireEvent.click(
      screen.getByRole("button", { name: /explain the last error/i }),
    );
    expect(onPick).toHaveBeenCalledWith(
      "Explain the last error in the terminal.",
    );
  });

  it("passes the open-ended command prefill to onPick", () => {
    const onPick = vi.fn();
    render(<EmptyState onPick={onPick} />);
    fireEvent.click(
      screen.getByRole("button", { name: /generate a command/i }),
    );
    expect(onPick).toHaveBeenCalledWith("Give me a command to ");
  });
});

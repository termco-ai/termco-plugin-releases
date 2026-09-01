// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommandSnippet } from "./CommandSnippet";

// The slashCommands barrel drags in the runtime dispatcher (plan store ->
// native -> bridge). Point it at the pure registry instead.
vi.mock("../../lib/slashCommands", async () => {
  return await import("../../lib/slashCommands/registry");
});

afterEach(cleanup);

describe("CommandSnippet", () => {
  it("renders invocation and label for a known command", () => {
    render(<CommandSnippet name="init" />);
    expect(screen.getByText("/init")).toBeInTheDocument();
    expect(screen.getByText("Initialize workspace")).toBeInTheDocument();
  });

  it("renders the plan command", () => {
    render(<CommandSnippet name="plan" />);
    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("Plan mode")).toBeInTheDocument();
  });

  it("falls back to a plain slash pill for unknown commands", () => {
    const { container } = render(<CommandSnippet name="unknown-cmd" />);
    expect(screen.getByText("/unknown-cmd")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });
});

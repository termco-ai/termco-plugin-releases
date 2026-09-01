// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ContextChips } from "./ContextChips";

afterEach(cleanup);

describe("ContextChips", () => {
  it("labels terminal and editor selections", () => {
    render(
      <ContextChips
        chips={[
          { kind: "selection", source: "terminal", lines: 4 },
          { kind: "selection", source: "editor", lines: 2 },
        ]}
      />,
    );
    expect(screen.getByText("Terminal selection")).toBeInTheDocument();
    expect(screen.getByText("Editor selection")).toBeInTheDocument();
    expect(screen.getByText("· 4L")).toBeInTheDocument();
    expect(screen.getByText("· 2L")).toBeInTheDocument();
  });

  it("labels file chips with their name and line count", () => {
    render(<ContextChips chips={[{ kind: "file", name: "a.ts", lines: 7 }]} />);
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("· 7L")).toBeInTheDocument();
  });

  it("labels snippet chips with a hash prefix and no line count", () => {
    render(<ContextChips chips={[{ kind: "snippet", name: "deploy" }]} />);
    expect(screen.getByText("#deploy")).toBeInTheDocument();
    expect(screen.queryByText(/L$/)).not.toBeInTheDocument();
  });

  it("hides the line count when it is zero", () => {
    render(
      <ContextChips
        chips={[{ kind: "selection", source: "terminal", lines: 0 }]}
      />,
    );
    expect(screen.queryByText(/· \dL/)).not.toBeInTheDocument();
  });
});

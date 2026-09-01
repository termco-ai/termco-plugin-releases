// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UnifiedDiffPreview } from "./UnifiedDiffPreview";

afterEach(cleanup);

describe("UnifiedDiffPreview", () => {
  it("shows a placeholder when nothing changed at line level", () => {
    render(<UnifiedDiffPreview original="a\nb" proposed="a\nb" />);
    expect(screen.getByText("no line-level changes")).toBeInTheDocument();
  });

  it("renders removed lines before added lines", () => {
    const { container } = render(
      <UnifiedDiffPreview original={"keep\nold"} proposed={"keep\nnew"} />,
    );
    const rows = Array.from(container.querySelectorAll(".flex.whitespace-pre"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("-old");
    expect(rows[1]).toHaveTextContent("+new");
  });

  it("does not list unchanged lines", () => {
    render(<UnifiedDiffPreview original={"keep\nold"} proposed={"keep"} />);
    expect(screen.queryByText("keep")).not.toBeInTheDocument();
    expect(screen.getByText("old")).toBeInTheDocument();
  });

  it("truncates past 80 changed lines with a rest note", () => {
    const original = "";
    const proposed = Array.from({ length: 101 }, (_, i) => `line-${i}`).join(
      "\n",
    );
    const { container } = render(
      <UnifiedDiffPreview original={original} proposed={proposed} />,
    );
    // 1 removed (the empty original line) + 101 added = 102; 80 shown.
    const rows = container.querySelectorAll(".flex.whitespace-pre");
    expect(rows).toHaveLength(80);
    expect(screen.getByText(/… 22 more changes/)).toBeInTheDocument();
  });

  it("renders empty changed lines as a space placeholder", () => {
    const { container } = render(
      <UnifiedDiffPreview original="x" proposed={"x\n"} />,
    );
    const rows = container.querySelectorAll(".flex.whitespace-pre");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toBe("+ ");
  });
});

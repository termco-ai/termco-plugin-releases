// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { highlight } from "./highlight";

afterEach(() => {
  cleanup();
});

function renderHighlight(text: string, query: string) {
  return render(<span data-testid="h">{highlight(text, query)}</span>);
}

describe("highlight", () => {
  it("returns the text untouched for an empty query", () => {
    const { getByTestId } = renderHighlight("Fix the bug", "");
    expect(getByTestId("h").textContent).toBe("Fix the bug");
    expect(getByTestId("h").querySelector("mark")).toBeNull();
  });

  it("returns the text untouched when nothing matches", () => {
    const { getByTestId } = renderHighlight("Fix the bug", "zzz");
    expect(getByTestId("h").textContent).toBe("Fix the bug");
    expect(getByTestId("h").querySelector("mark")).toBeNull();
  });

  it("wraps the first case-insensitive match in a mark", () => {
    const { getByTestId } = renderHighlight("Fix The Bug", "the");
    const mark = getByTestId("h").querySelector("mark");
    expect(mark?.textContent).toBe("The");
    expect(getByTestId("h").textContent).toBe("Fix The Bug");
  });

  it("only highlights the first of several occurrences", () => {
    const { getByTestId } = renderHighlight("aba aba", "aba");
    expect(getByTestId("h").querySelectorAll("mark")).toHaveLength(1);
    expect(getByTestId("h").textContent).toBe("aba aba");
  });

  it("handles a match at the start and end of the text", () => {
    const start = renderHighlight("bugfix", "bug");
    expect(start.getByTestId("h").querySelector("mark")?.textContent).toBe(
      "bug",
    );
    cleanup();
    const end = renderHighlight("fixbug", "bug");
    expect(end.getByTestId("h").querySelector("mark")?.textContent).toBe("bug");
  });
});

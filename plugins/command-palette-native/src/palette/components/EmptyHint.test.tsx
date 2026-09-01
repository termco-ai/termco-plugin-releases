// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyHint } from "./EmptyHint";

afterEach(cleanup);

describe("EmptyHint", () => {
  it("nudges the user toward the search-modes help", () => {
    const { container } = render(<EmptyHint />);
    expect(
      screen.getByText("No commands found. Type ? to see search modes."),
    ).toBeDefined();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

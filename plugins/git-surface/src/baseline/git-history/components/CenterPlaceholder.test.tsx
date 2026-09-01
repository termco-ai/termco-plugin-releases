// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CenterPlaceholder } from "./CenterPlaceholder";

afterEach(() => {
  cleanup();
});

describe("CenterPlaceholder", () => {
  it("renders its children centered in a flex column", () => {
    render(
      <CenterPlaceholder>
        <span>No commits yet</span>
      </CenterPlaceholder>,
    );
    const child = screen.getByText("No commits yet");
    expect(child.parentElement?.className).toContain("items-center");
    expect(child.parentElement?.className).toContain("justify-center");
  });
});

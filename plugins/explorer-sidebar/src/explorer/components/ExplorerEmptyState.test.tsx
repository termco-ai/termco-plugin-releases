// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExplorerEmptyState } from "./ExplorerEmptyState";

afterEach(cleanup);

describe("ExplorerEmptyState", () => {
  it("shows the no-workspace message", () => {
    render(<ExplorerEmptyState />);
    expect(screen.getByText("No workspace open")).toBeDefined();
  });
});

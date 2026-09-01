// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanelCenter } from "./PanelCenter";

afterEach(cleanup);

describe("PanelCenter", () => {
  it("renders the title", () => {
    render(<PanelCenter title="Loading repository" />);
    expect(screen.getByText("Loading repository")).toBeInTheDocument();
  });

  it("renders an optional body", () => {
    render(<PanelCenter title="No repository" body="Not inside a repo." />);
    expect(screen.getByText("Not inside a repo.")).toBeInTheDocument();
  });

  it("omits the body element when not provided", () => {
    render(<PanelCenter title="Only title" />);
    expect(screen.getByText("Only title").parentElement?.children).toHaveLength(
      1,
    );
  });

  it("renders an optional action node", () => {
    render(
      <PanelCenter
        title="Error"
        action={<button type="button">Retry</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
